from typing import Callable
from import_export.constants import CURRENT_VERSION
# import convenient


class VersionConverter:
    """
    Applies a chain of conversions to bring import data
    from any old version to CURRENT_VERSION
    """

    # Ordered registry: {from_version: migration_func}
    _conversions: dict[int, Callable[[dict], dict]] = {}

    @classmethod
    def register(cls, from_version: int):
        """
        Decorator to register a concrete version converter
        """

        def decorator(func):
            cls._conversions[from_version] = func
            return func

        return decorator

    @classmethod
    def convert(cls, data: dict) -> dict:
        version = data.get("version", 1)  # old files default to v1

        if version > CURRENT_VERSION:
            raise Exception
        # Think about handling that error
        # ValidationError(
        #         f"File version {version} is newer than supported {CURRENT_VERSION}"
        #     )

        while version < CURRENT_VERSION:
            if version not in cls._conversions:
                raise Exception
            # Think about handling that error
            # ValidationError(
            #     f"No migration path from version {version}"
            # )

            data = cls._conversions[version](data)
            version += 1
            data["version"] = version

            return data
