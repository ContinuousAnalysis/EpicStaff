from tables.models.python_models import PythonCode


def copy_python_code(python_code: PythonCode) -> PythonCode:
    """Create and return a new PythonCode instance with all fields duplicated."""
    return PythonCode.objects.create(
        code=python_code.code,
        entrypoint=python_code.entrypoint,
        libraries=python_code.libraries,
        global_kwargs=python_code.global_kwargs,
    )


def get_base_node_fields(node) -> dict:
    """Return a dict of the shared BaseNode plain fields (excluding graph and id)."""
    return {
        "input_map": node.input_map,
        "node_name": node.node_name,
        "output_variable_path": node.output_variable_path,
        "metadata": node.metadata,
    }
