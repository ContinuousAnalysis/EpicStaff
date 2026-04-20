from dataclasses import asdict
import json
import re
import uuid
from typing import Any
from loguru import logger
import litellm
from src.crew.services.graph.events import StopEvent
from src.crew.services.graph.custom_message_writer import CustomSessionMessageWriter
from src.crew.models.graph_models import (
    GraphMessage,
)
from src.shared.models import LLMData, PythonCodeData
from src.shared.models.graph_nodes import (
    ClassificationDecisionTableNodeData,
    PromptConfigData,
)
from src.crew.models.state import State
from langgraph.types import StreamWriter
from src.crew.services.run_python_code_service import RunPythonCodeService

from langgraph.graph import StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.graph import START, END


def extract_first_json_object(text: str) -> Any:
    """Extract the first JSON object from a text string."""
    cleaned = text.replace("```", "")
    cleaned = re.sub(r"\bjson\b", "", cleaned, flags=re.IGNORECASE)

    start = cleaned.find("{")
    if start == -1:
        return text

    depth = 0
    for i in range(start, len(cleaned)):
        ch = cleaned[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = cleaned[start : i + 1]
                try:
                    return json.loads(candidate)
                except Exception:
                    return text
    return text


class ClassificationDecisionTableNodeError(Exception):
    """Custom exception for errors related to ClassificationDecisionTableNode."""


class ClassificationDecisionTableNodeSubgraph:
    TYPE = "CLASSIFICATION_DECISION_TABLE"

    def __init__(
        self,
        session_id: int,
        node_data: ClassificationDecisionTableNodeData,
        graph_builder: StateGraph,
        stop_event: StopEvent,
        redis_service=None,
        custom_session_message_writer: CustomSessionMessageWriter | None = None,
    ):
        self.node_data = node_data
        self._graph_builder = graph_builder
        self.session_id = session_id
        self.node_name = node_data.node_name
        self.stop_event = stop_event
        self.redis_service = redis_service
        self.custom_session_message_writer = (
            custom_session_message_writer or CustomSessionMessageWriter()
        )

    def _publish_message(self, graph_message: GraphMessage):
        """Publish a GraphMessage directly to Redis.
        Subgraph StreamWriter messages don't propagate to the parent graph's
        astream, so we publish directly to Redis instead."""
        if self.redis_service is None:
            return
        try:
            data = asdict(graph_message)
        except (TypeError, Exception) as e:
            logger.warning(f"Failed to serialize GraphMessage via asdict: {e}")
            data = {
                "session_id": graph_message.session_id,
                "name": graph_message.name,
                "execution_order": graph_message.execution_order,
                "message_data": graph_message.message_data
                if isinstance(graph_message.message_data, dict)
                else {
                    "message_type": getattr(
                        graph_message.message_data, "message_type", "unknown"
                    )
                },
                "timestamp": graph_message.timestamp,
            }
        data["uuid"] = str(uuid.uuid4())
        self.redis_service.publish("graph:messages", data)

    @staticmethod
    def _resolve_path(path_expr: str, ctx: dict):
        """Safely resolve a dot/bracket path expression against a context dict.

        Supports:
          - dot access:    "variables.chat_id"
          - bracket access with dynamic key: "variables.shared[variables.chat_id].lease_holder"
          - direct lookup: "session_id"

        No eval() is used.
        """
        import re

        # Tokenise into dot-segments and bracket-segments
        # e.g. "variables.shared[variables.chat_id].lease_holder"
        #   → ["variables", "shared", "[variables.chat_id]", "lease_holder"]
        tokens: list[str] = []
        for part in re.split(r"\.(?![^\[]*\])", path_expr):
            # Split bracket sub-expressions within each part
            sub = re.split(r"(\[[^\]]+\])", part)
            for s in sub:
                if s:
                    tokens.append(s)

        value = None
        for i, token in enumerate(tokens):
            if token.startswith("[") and token.endswith("]"):
                # Bracket access — resolve the inner expression recursively
                inner = token[1:-1]
                key = ClassificationDecisionTableNodeSubgraph._resolve_path(inner, ctx)
                value = value[key]
            elif i == 0:
                # First token — look up in context
                if token in ctx:
                    value = ctx[token]
                else:
                    raise KeyError(f"'{token}' not found in context")
            else:
                # Dot access — try getattr, then [] for dict-like objects
                try:
                    value = getattr(value, token)
                except AttributeError:
                    value = value[token]
        return value

    def _build_exec_namespace(
        self, state: State, input_map: dict[str, str] | None = None
    ) -> dict:
        """Build a namespace dict for in-process exec().

        Only input map entries are injected into the namespace.
        Each entry resolves a path expression against the state context
        (variables, system_variables, redis_service, session_id, etc.).
        """
        import time as _time_mod
        import uuid as _uuid_mod

        resolve_ctx: dict = {
            "variables": state["variables"],
            "system_variables": state.get("system_variables", {}),
            "redis_service": self.redis_service,
            "session_id": self.session_id,
            "node_name": self.node_name,
            "logger": logger,
            "time": _time_mod,
            "json": json,
            "uuid": _uuid_mod,
        }

        namespace: dict = {}

        # Clear shared-variable caches so we always read fresh from Redis
        shared = getattr(state["variables"], "shared", None)
        if shared is not None and hasattr(shared, "_clear_cache"):
            shared._clear_cache()

        if input_map:
            for local_name, path_expr in input_map.items():
                try:
                    namespace[local_name] = self._resolve_path(path_expr, resolve_ctx)
                except Exception as e:
                    logger.warning(
                        f"Input map resolve failed for '{local_name}' = '{path_expr}': {e}"
                    )
                    namespace[local_name] = None

        return namespace

    async def _execute_computation(
        self,
        code: str | None,
        input_map: dict[str, str] | None,
        output_variable_path: str | None,
        state: State,
        label: str,
    ) -> None:
        """Execute computation code using the main() function pattern.

        1. exec() the code to define main()
        2. Call main(**input_map_kwargs)
        3. Store the return value in output_variable_path (if set)
        """
        if not code:
            return

        namespace = self._build_exec_namespace(state, input_map)

        try:
            exec(code, namespace)
        except Exception as e:
            raise ClassificationDecisionTableNodeError(
                f"{label} failed during definition: {e}"
            )

        main_fn = namespace.get("main")
        if main_fn is None:
            logger.warning(f"{label}: no main() function defined, skipping call")
            return

        # Only pass input map entries to main(), not exec artifacts
        call_kwargs = {
            k: namespace[k] for k in (input_map or {}).keys() if k in namespace
        }

        try:
            result = main_fn(**call_kwargs)
        except Exception as e:
            raise ClassificationDecisionTableNodeError(f"{label} main() failed: {e}")

        if result is not None:
            if isinstance(result, dict):
                self._handle_shared_protocol(result, state, label)

            if output_variable_path:
                from utils.set_output_variables import set_output_variables

                set_output_variables(
                    state=state,
                    output_variable_path=output_variable_path,
                    output=result,
                )

    def _handle_shared_protocol(self, result: dict, state: State, label: str) -> None:
        # Handle atomic list appends before normal output.
        # Pre/post computation can return {"shared_append": {access_key: {"var_name": [items]}}}
        # to atomically append items to shared list variables (avoids read-modify-write races).
        shared_append = result.pop("shared_append", None)
        if shared_append and isinstance(shared_append, dict):
            shared = getattr(state.get("variables", {}), "shared", None)
            if shared is not None:
                for access_key, updates in shared_append.items():
                    if isinstance(updates, dict):
                        scope = shared[access_key]
                        for var_name, items in updates.items():
                            if isinstance(items, list):
                                updated = scope.atomic_list_append(var_name, items)
                                logger.info(
                                    f"{label} shared_append: {access_key}.{var_name} now has {len(updated)} items"
                                )
            else:
                logger.warning(
                    f"{label} shared_append requested but no shared proxy available"
                )

        # Handle atomic claims (SETNX). Returns claim results into the result dict.
        # Format: {"shared_claim": {access_key: {"var_name": value_or_dict}}}
        #   value_or_dict can be a plain value (uses default TTL)
        #   or {"value": X, "ttl": seconds} for custom TTL.
        # Result: {"claim_results": {"var_name": True/False}}
        shared_claim = result.pop("shared_claim", None)
        if shared_claim and isinstance(shared_claim, dict):
            shared = getattr(state.get("variables", {}), "shared", None)
            if shared is not None:
                claim_results = {}
                for access_key, claims in shared_claim.items():
                    if isinstance(claims, dict):
                        scope = shared[access_key]
                        for var_name, raw_value in claims.items():
                            if isinstance(raw_value, dict) and "value" in raw_value:
                                value = raw_value["value"]
                                ttl = raw_value.get("ttl")
                            else:
                                value = raw_value
                                ttl = None
                            claimed = scope.claim(var_name, value, ttl=ttl)
                            claim_results[var_name] = claimed
                            logger.info(
                                f"{label} shared_claim: {access_key}.{var_name} = {claimed}"
                            )
                result["claim_results"] = claim_results

        # Handle shared variable releases (key deletion).
        # Format: {"shared_release": {access_key: ["var_name", ...]}}
        # Deletes the Redis key so a subsequent claim() can succeed.
        shared_release = result.pop("shared_release", None)
        if shared_release and isinstance(shared_release, dict):
            shared = getattr(state.get("variables", {}), "shared", None)
            if shared is not None:
                for access_key, var_names in shared_release.items():
                    if isinstance(var_names, list):
                        scope = shared[access_key]
                        for var_name in var_names:
                            released = scope.release(var_name)
                            logger.info(
                                f"{label} shared_release: {access_key}.{var_name} = {released}"
                            )

    async def _execute_pre_computation(self, state: State) -> None:
        """Execute pre-computation code using main() function pattern.
        Supports two-phase execution: if the computation returns needs_rerun=True
        (e.g. after a shared_append), the shared variable cache is cleared and
        the computation re-runs so it reads fresh data from Redis."""
        await self._execute_computation(
            code=self.node_data.pre_computation_code,
            input_map=self.node_data.pre_input_map,
            output_variable_path=self.node_data.pre_output_variable_path,
            state=state,
            label="Pre-computation",
        )

        needs_rerun = getattr(state.get("variables", {}), "needs_rerun", None)
        logger.info(f"Pre-computation phase 1 done. needs_rerun={needs_rerun}")
        if needs_rerun:
            state["variables"]["needs_rerun"] = None
            shared = getattr(state.get("variables", {}), "shared", None)
            if shared is not None:
                shared._clear_cache()
            await self._execute_computation(
                code=self.node_data.pre_computation_code,
                input_map=self.node_data.pre_input_map,
                output_variable_path=self.node_data.pre_output_variable_path,
                state=state,
                label="Pre-computation (rerun)",
            )

    async def _execute_post_computation(self, state: State) -> None:
        """Execute post-computation code using main() function pattern."""
        await self._execute_computation(
            code=self.node_data.post_computation_code,
            input_map=self.node_data.post_input_map,
            output_variable_path=self.node_data.post_output_variable_path,
            state=state,
            label="Post-computation",
        )

    def _build_var_assignments(self, variable_keys: list[str]) -> str:
        """Generate explicit local variable assignments from state keys."""
        lines = []
        for key in variable_keys:
            if key.isidentifier():
                lines.append(f"    {key} = _to_ns(_raw.get('{key}'))")
        return "\n".join(lines)

    async def _execute_expression(self, expression: str, state: State) -> bool:
        """Evaluate a Python expression in sandbox. Returns bool."""
        variables_dict = state["variables"].model_dump()
        if "shared" in variables_dict:
            del variables_dict["shared"]

        var_assignments = self._build_var_assignments(list(variables_dict.keys()))

        code = f"""
import types

def _to_ns(obj):
    if isinstance(obj, dict):
        return types.SimpleNamespace(**{{k: _to_ns(v) for k, v in obj.items()}})
    if isinstance(obj, list):
        return [_to_ns(i) for i in obj]
    return obj

def main(**kwargs) -> bool:
    _raw = kwargs.get("variables", {{}})
{var_assignments}
    variables = _to_ns(_raw)
    result: bool = {expression}
    assert isinstance(result, bool), "Expression must return a boolean value"
    return result
"""
        python_code_data = PythonCodeData(
            venv_name="default",
            code=code,
            entrypoint="main",
            libraries=[],
        )

        result = await RunPythonCodeService(redis_service=self.redis_service).run_code(
            python_code_data=python_code_data,
            inputs={"variables": variables_dict},
            stop_event=self.stop_event,
        )

        if result["returncode"] != 0:
            raise ClassificationDecisionTableNodeError(
                f"Expression execution failed: {result['stderr']}"
            )
        return json.loads(result["result_data"]) or False

    async def _execute_manipulation(self, manipulation: str, state: State) -> None:
        """Execute manipulation code in sandbox. Updates state variables."""
        variables_dict = state["variables"].model_dump()
        if "shared" in variables_dict:
            del variables_dict["shared"]

        var_assignments = self._build_var_assignments(list(variables_dict.keys()))

        code = f"""
import types

def _to_ns(obj):
    if isinstance(obj, dict):
        return types.SimpleNamespace(**{{k: _to_ns(v) for k, v in obj.items()}})
    if isinstance(obj, list):
        return [_to_ns(i) for i in obj]
    return obj

def _from_ns(obj):
    if isinstance(obj, types.SimpleNamespace):
        return {{k: _from_ns(v) for k, v in vars(obj).items()}}
    if isinstance(obj, list):
        return [_from_ns(i) for i in obj]
    return obj

def main(**kwargs) -> dict:
    _raw = kwargs.get("variables", {{}})
    _var_keys = list(_raw.keys())
{var_assignments}
    variables = _to_ns(_raw)

{self._indent_code(manipulation)}

    # Write modified locals back into the variables namespace
    _lcl = locals()
    _internal = {{"_raw", "_var_keys", "variables", "_lcl", "_k", "_internal", "kwargs", "_to_ns", "_from_ns"}}
    for _k in _var_keys:
        if _k in _lcl:
            setattr(variables, _k, _lcl[_k])
    # Also persist NEW variables created by manipulation code
    for _k in _lcl:
        if _k not in _internal and _k not in _var_keys and not _k.startswith("_"):
            setattr(variables, _k, _lcl[_k])

    # Write back from namespace to dict
    return _from_ns(variables)
"""
        python_code_data = PythonCodeData(
            venv_name="default",
            code=code,
            entrypoint="main",
            libraries=[],
        )

        variables_dict = state["variables"].model_dump()
        if "shared" in variables_dict:
            del variables_dict["shared"]

        result = await RunPythonCodeService(redis_service=self.redis_service).run_code(
            python_code_data=python_code_data,
            inputs={"variables": variables_dict},
            stop_event=self.stop_event,
        )

        if result["returncode"] != 0:
            raise ClassificationDecisionTableNodeError(
                f"Manipulation execution failed: {result['stderr']}"
            )

        variables = json.loads(result["result_data"])
        state["variables"].update(variables)

    async def _run_json_llm(
        self, prompt: str, llm: LLMData
    ) -> tuple[Any, dict[str, int]]:
        """Call LLM via litellm and parse JSON response."""
        llm_config = llm.config
        litellm.drop_params = True
        params = {
            "model": f"{llm.provider}/{llm_config.model}",
            "timeout": llm_config.timeout,
            "temperature": llm_config.temperature,
            "top_p": llm_config.top_p,
            "stop": llm_config.stop,
            "max_tokens": llm_config.max_tokens,
            "presence_penalty": llm_config.presence_penalty,
            "frequency_penalty": llm_config.frequency_penalty,
            "logit_bias": llm_config.logit_bias,
            "response_format": llm_config.response_format,
            "seed": llm_config.seed,
            "base_url": llm_config.base_url,
            "api_version": llm_config.api_version,
            "api_key": llm_config.api_key,
            "stream": False,
        }
        resp = await litellm.acompletion(
            **{**params, "messages": [{"role": "user", "content": prompt}]}
        )

        usage = {
            "total_tokens": getattr(resp.usage, "total_tokens", 0)
            if hasattr(resp, "usage")
            else 0,
            "prompt_tokens": getattr(resp.usage, "prompt_tokens", 0)
            if hasattr(resp, "usage")
            else 0,
            "completion_tokens": getattr(resp.usage, "completion_tokens", 0)
            if hasattr(resp, "usage")
            else 0,
            "successful_requests": 1,
        }

        content = resp.choices[0].message.content
        if not isinstance(content, str):
            return content, usage
        return extract_first_json_object(content), usage

    def _render_prompt(self, prompt_text: str, variables: dict) -> str:
        """Render prompt template with variable interpolation using {var_name} syntax."""
        try:
            return prompt_text.format(**variables)
        except (KeyError, IndexError):
            # If template vars don't match, return as-is
            return prompt_text

    async def _execute_prompt(self, prompt_id: str, state: State) -> dict:
        """Execute an LLM prompt referenced by ID. Stores result in variables.
        Returns dict with prompt_text, raw_response, parsed_result, result_variable, usage."""
        prompt_config: PromptConfigData | None = self.node_data.prompts.get(prompt_id)
        if prompt_config is None:
            logger.warning(
                f"Prompt ID '{prompt_id}' not found in prompt library, skipping."
            )
            return {}

        llm_data = prompt_config.llm_data
        if llm_data is None:
            raise ClassificationDecisionTableNodeError(
                f"No LLM configuration resolved for prompt '{prompt_id}' (llm_id={prompt_config.llm_id})"
            )

        # Render prompt with current variables
        variables_dict = state["variables"].model_dump()
        if "shared" in variables_dict:
            del variables_dict["shared"]
        rendered_prompt = self._render_prompt(prompt_config.prompt_text, variables_dict)

        logger.info(
            f"Executing prompt '{prompt_id}' with LLM {llm_data.provider}/{llm_data.config.model}, "
            f"result_variable='{prompt_config.result_variable}'"
        )

        try:
            result, usage = await self._run_json_llm(
                prompt=rendered_prompt, llm=llm_data
            )
        except Exception as e:
            error_msg = (
                f"ERROR Prompt '{prompt_id}' LLM call failed: {type(e).__name__}: {e}"
            )
            logger.info(error_msg)
            raise ClassificationDecisionTableNodeError(
                f"LLM call failed for prompt '{prompt_id}': {type(e).__name__}: {e}"
            ) from e

        # Capture raw response text before JSON parsing
        raw_response = str(result) if not isinstance(result, str) else result

        logger.info(
            f"Prompt '{prompt_id}' completed. "
            f"Tokens: {usage.get('total_tokens', 0)}, "
            f"Result type: {type(result).__name__}"
        )

        # Store result in state variables under result_variable
        result_var = prompt_config.result_variable or "prompt_result"
        state["variables"].update({result_var: result})

        # Apply variable_mappings: extract specific fields from result into state variables
        if prompt_config.variable_mappings and isinstance(result, dict):
            for state_var, result_field in prompt_config.variable_mappings.items():
                if result_field in result:
                    state["variables"].update({state_var: result[result_field]})
                    logger.info(
                        f"Mapped result.{result_field} -> variables.{state_var}"
                    )

        return {
            "prompt_text": rendered_prompt,
            "raw_response": raw_response,
            "parsed_result": result,
            "result_variable": result_var,
            "usage": usage,
        }

    def _indent_code(self, code: str) -> str:
        """Indent code block by 4 spaces for wrapping inside a function."""
        lines = code.split("\n")
        return "\n".join("    " + line for line in lines)

    def execution_order(self, state: State):
        return state["system_variables"]["nodes"][self.node_name]["execution_order"]

    def build(self) -> CompiledStateGraph:
        """Build the classification decision table subgraph."""

        enter_node = self.node_data.node_name
        evaluate_node = self.node_data.node_name + "_evaluate"

        # Sort condition groups by order
        sorted_groups = sorted(
            self.node_data.condition_groups,
            key=lambda g: g.order,
        )

        async def enter_node_function(state: State, writer: StreamWriter):
            logger.info(f"Entering classification decision table: {self.node_name}")

            update_variables = {
                "result_node": None,
                "route_code": None,
                "default_node": self.node_data.default_next_node,
            }
            if state["system_variables"].get("nodes") is None:
                state["system_variables"]["nodes"] = {}
            if state["system_variables"]["nodes"].get(self.node_name) is None:
                state["system_variables"]["nodes"][self.node_name] = update_variables
                state["system_variables"]["nodes"][self.node_name][
                    "execution_order"
                ] = 0
            else:
                state["system_variables"]["nodes"][self.node_name].update(
                    update_variables
                )
                state["system_variables"]["nodes"][self.node_name][
                    "execution_order"
                ] = (
                    state["system_variables"]["nodes"][self.node_name][
                        "execution_order"
                    ]
                    + 1
                )

            # Also reset route_code in state variables so stale values from
            # previous passes don't leak into condition group evaluation.
            route_var = self.node_data.route_variable_name
            if route_var:
                state["variables"].update({route_var: None})

            input_vars = state["variables"].model_dump()
            if "shared" in input_vars:
                del input_vars["shared"]
            msg = self.custom_session_message_writer.add_start_message(
                session_id=self.session_id,
                node_name=self.node_name,
                writer=writer,
                input_=input_vars,
                execution_order=self.execution_order(state),
            )
            self._publish_message(msg)

            # Execute pre-computation
            try:
                await self._execute_pre_computation(state)
            except ClassificationDecisionTableNodeError as e:
                logger.error(f"Pre-computation error: {e}")
                state["system_variables"]["nodes"][self.node_name]["result_node"] = (
                    self.node_data.next_error_node or END
                )
                msg = self.custom_session_message_writer.add_error_message(
                    session_id=self.session_id,
                    node_name=self.node_name,
                    error=str(e),
                    writer=writer,
                    execution_order=self.execution_order(state),
                )
                self._publish_message(msg)
                return state

            return state

        async def evaluate_node_function(state: State, writer: StreamWriter):
            """Evaluate all condition groups top-to-bottom with continue/stop logic."""
            logger.info(f"Evaluating classification decision table: {self.node_name}")

            decision_vars = state["system_variables"]["nodes"][self.node_name]

            # If result already set (e.g., pre-computation error), skip
            if decision_vars["result_node"] is not None:
                msg = self.custom_session_message_writer.add_finish_message(
                    session_id=self.session_id,
                    node_name=self.node_name,
                    writer=writer,
                    output=decision_vars["result_node"],
                    execution_order=self.execution_order(state),
                    state=state,
                )
                self._publish_message(msg)
                return state

            matched_route_code = None
            matched_condition_name = None

            for group in sorted_groups:
                try:
                    # Step 1: Build combined expression from field_expressions + main expression
                    # Field expression format:
                    #   - Bare value: auto-wrapped as `field == value` (value must be valid Python, e.g. `"start"`, `True`, `42`)
                    #   - Operator prefix: `> 5`, `!= "end"`, `in ("a", "b")` → prepended with field name
                    #   - Full expression with operators: used as-is (e.g. `field > 0 and field < 10`)
                    parts = []
                    _operator_prefixes = (
                        "==",
                        "!=",
                        ">=",
                        "<=",
                        ">",
                        "<",
                        " in ",
                        " not ",
                    )
                    if group.field_expressions:
                        for field_name, field_expr in group.field_expressions.items():
                            if field_expr and field_expr.strip():
                                expr = field_expr.strip()
                                if expr.startswith(
                                    _operator_prefixes
                                ) or expr.startswith(("in ", "not ", "is ")):
                                    expr = f"{field_name} {expr}"
                                elif not any(
                                    op in expr
                                    for op in (
                                        "==",
                                        "!=",
                                        ">=",
                                        "<=",
                                        ">",
                                        "<",
                                        " in ",
                                        " not ",
                                        " is ",
                                        " and ",
                                        " or ",
                                    )
                                ):
                                    expr = f"{field_name} == {expr}"
                                parts.append(f"({expr})")
                    if group.expression and group.expression.strip():
                        parts.append(f"({group.expression.strip()})")

                    combined_expression = " and ".join(parts) if parts else None

                    expression_result = True
                    if combined_expression:
                        expression_result = await self._execute_expression(
                            expression=combined_expression,
                            state=state,
                        )

                    msg = (
                        self.custom_session_message_writer.add_condition_group_message(
                            session_id=self.session_id,
                            node_name=self.node_name,
                            group_name=group.group_name,
                            result=expression_result,
                            writer=writer,
                            execution_order=self.execution_order(state),
                            expression=group.expression,
                        )
                    )
                    self._publish_message(msg)

                    if not expression_result:
                        continue

                    logger.info(f"Condition '{group.group_name}' matched.")
                    matched_condition_name = group.group_name

                    # Step 2: Execute prompt (if prompt_id is set)
                    if group.prompt_id:
                        prompt_result = await self._execute_prompt(
                            group.prompt_id, state
                        )
                        if prompt_result:
                            msg = self.custom_session_message_writer.add_classification_prompt_message(
                                session_id=self.session_id,
                                node_name=self.node_name,
                                writer=writer,
                                execution_order=self.execution_order(state),
                                prompt_id=group.prompt_id,
                                prompt_text=prompt_result.get("prompt_text", ""),
                                raw_response=prompt_result.get("raw_response", ""),
                                parsed_result=prompt_result.get("parsed_result"),
                                result_variable=prompt_result.get(
                                    "result_variable", ""
                                ),
                                usage=prompt_result.get("usage", {}),
                            )
                            self._publish_message(msg)

                    # Step 3: Execute manipulation (field_manipulations + main manipulation)
                    manip_parts = []
                    if group.field_manipulations:
                        for var_name, var_expr in group.field_manipulations.items():
                            if var_expr and var_expr.strip():
                                manip_parts.append(f"{var_name} = {var_expr.strip()}")
                    if group.manipulation:
                        manip_parts.append(group.manipulation)
                    combined_manipulation = (
                        "\n".join(manip_parts) if manip_parts else None
                    )

                    if combined_manipulation:
                        vars_before = state["variables"].model_dump()
                        if "shared" in vars_before:
                            del vars_before["shared"]
                        await self._execute_manipulation(combined_manipulation, state)
                        vars_after = state["variables"].model_dump()
                        if "shared" in vars_after:
                            del vars_after["shared"]
                        changed = {
                            k: v
                            for k, v in vars_after.items()
                            if vars_before.get(k) != v
                        }
                        msg = self.custom_session_message_writer.add_condition_group_manipulation_message(
                            session_id=self.session_id,
                            node_name=self.node_name,
                            group_name=group.group_name,
                            state=state,
                            writer=writer,
                            execution_order=self.execution_order(state),
                            changed_variables=changed,
                        )
                        self._publish_message(msg)

                    # Step 4: Capture route_code from this row and sync to state variables
                    if group.route_code:
                        matched_route_code = group.route_code
                        state["variables"].update(
                            {self.node_data.route_variable_name: group.route_code}
                        )

                    # Step 5: Check continue flag
                    if not group.continue_flag:
                        # Stop evaluation
                        break

                except ClassificationDecisionTableNodeError as e:
                    error = f"Error in condition '{group.group_name}': {e}"
                    if self.node_data.expression_errors_as_false:
                        logger.warning(
                            f"{error} — treating as false (expression_errors_as_false=True)"
                        )
                        msg = self.custom_session_message_writer.add_condition_group_message(
                            session_id=self.session_id,
                            node_name=self.node_name,
                            group_name=group.group_name,
                            result=False,
                            writer=writer,
                            execution_order=self.execution_order(state),
                            expression=f"ERROR: {e}",
                        )
                        self._publish_message(msg)
                        continue
                    logger.info(f"ERROR {error}")
                    decision_vars["result_node"] = self.node_data.next_error_node or END
                    msg = self.custom_session_message_writer.add_error_message(
                        session_id=self.session_id,
                        node_name=self.node_name,
                        error=error,
                        writer=writer,
                        execution_order=self.execution_order(state),
                    )
                    self._publish_message(msg)
                    return state
                except Exception as e:
                    error = f"Unexpected error in condition '{group.group_name}': {type(e).__name__}: {e}"
                    logger.info(f"ERROR {error}")
                    decision_vars["result_node"] = self.node_data.next_error_node or END
                    msg = self.custom_session_message_writer.add_error_message(
                        session_id=self.session_id,
                        node_name=self.node_name,
                        error=error,
                        writer=writer,
                        execution_order=self.execution_order(state),
                    )
                    self._publish_message(msg)
                    return state

            # Determine final route
            # Check if route_code was set in variables by manipulation code
            variables_dict = state["variables"].model_dump()
            route_var = self.node_data.route_variable_name
            variable_route_code = variables_dict.get(route_var)

            # Priority: variable route_code > matched row route_code > default
            final_route_code = variable_route_code or matched_route_code

            if final_route_code:
                decision_vars["route_code"] = final_route_code
                decision_vars["result_node"] = final_route_code
            else:
                decision_vars["result_node"] = self.node_data.default_next_node or END

            # Execute post-computation (in-process, has access to shared variables)
            try:
                await self._execute_post_computation(state)
            except ClassificationDecisionTableNodeError as e:
                logger.error(f"Post-computation error: {e}")
                decision_vars["result_node"] = self.node_data.next_error_node or END
                msg = self.custom_session_message_writer.add_error_message(
                    session_id=self.session_id,
                    node_name=self.node_name,
                    error=str(e),
                    writer=writer,
                    execution_order=self.execution_order(state),
                )
                self._publish_message(msg)
                return state

            logger.info(
                f"Classification table '{self.node_name}' result: "
                f"route_code={final_route_code}, result_node={decision_vars['result_node']}"
            )

            msg = self.custom_session_message_writer.add_finish_message(
                session_id=self.session_id,
                node_name=self.node_name,
                writer=writer,
                output=decision_vars["result_node"],
                execution_order=self.execution_order(state),
                state=state,
                matched_condition=matched_condition_name,
                route_code=final_route_code,
            )
            self._publish_message(msg)

            return state

        # Build the subgraph: enter → evaluate → END
        self._graph_builder.add_node(enter_node, enter_node_function)
        self._graph_builder.add_node(evaluate_node, evaluate_node_function)
        self._graph_builder.add_edge(START, enter_node)
        self._graph_builder.add_edge(enter_node, evaluate_node)
        self._graph_builder.add_edge(evaluate_node, END)

        return self._graph_builder.compile()
