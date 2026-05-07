import pytest

from tables.graph_versioning.handlers import _MissingSets
from tables.import_export.enums import NodeType

# Dependency IDs used consistently across all handler tests
_CREW_ID = 42
_LLM_CONFIG_ID = 3
_SUBGRAPH_ID = 5
_WEBHOOK_TRIGGER_ID = 7


@pytest.fixture
def crew_node_dict():
    return {
        "id": 10,
        "node_type": NodeType.CREW_NODE,
        "node_name": "Crew Node",
        "crew": _CREW_ID,
    }


@pytest.fixture
def llm_node_dict():
    return {
        "id": 20,
        "node_type": NodeType.LLM_NODE,
        "node_name": "LLM Node",
        "llm_config": _LLM_CONFIG_ID,
    }


@pytest.fixture
def subgraph_node_dict():
    return {
        "id": 30,
        "node_type": NodeType.SUBGRAPH_NODE,
        "node_name": "Subgraph Node",
        "subgraph": _SUBGRAPH_ID,
    }


@pytest.fixture
def code_agent_node_dict():
    return {
        "id": 40,
        "node_type": NodeType.CODE_AGENT_NODE,
        "node_name": "Code Agent Node",
        "llm_config": _LLM_CONFIG_ID,
    }


@pytest.fixture
def webhook_trigger_node_dict():
    return {
        "id": 50,
        "node_type": NodeType.WEBHOOK_TRIGGER_NODE,
        "node_name": "Webhook Trigger Node",
        "webhook_trigger": _WEBHOOK_TRIGGER_ID,
    }


@pytest.fixture
def telegram_trigger_node_dict():
    return {
        "id": 60,
        "node_type": NodeType.TELEGRAM_TRIGGER_NODE,
        "node_name": "Telegram Trigger Node",
        "webhook_trigger": _WEBHOOK_TRIGGER_ID,
    }


@pytest.fixture
def empty_missing_sets():
    return _MissingSets(crews=set(), subgraphs=set(), llm_configs=set(), webhooks=set())


@pytest.fixture
def full_missing_sets():
    return _MissingSets(
        crews={_CREW_ID},
        subgraphs={_SUBGRAPH_ID},
        llm_configs={_LLM_CONFIG_ID},
        webhooks={_WEBHOOK_TRIGGER_ID},
    )
