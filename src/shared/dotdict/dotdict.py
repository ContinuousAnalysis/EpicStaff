from dataclasses import dataclass
import json
from typing import Any, Mapping
from contextlib import contextmanager


@dataclass
class Expression:
    code: str
    func: Any

    def __call__(self, *args, **kwargs):
        return self.func(*args, **kwargs)


class DotDict(object):
    def __init__(self, dictionary=None):
        object.__setattr__(self, "__data", {})

        if dictionary is None:
            dictionary = {}
        dictionary = dict(dictionary)

        for key, value in dictionary.items():
            self[key] = value

    def __setitem__(self, key, value):

        if not isinstance(value, (DotDict, DotList)):
            value = DotObject(value)
        self["__data"][key] = value

    def __getitem__(self, key):
        data = object.__getattribute__(self, "__data")
        if key not in data:
            data[key] = DotDict()
        return data[key]

    def __getattr__(self, key):
        return self.__getitem__(key)

    def __setattr__(self, name, value):
        self.__setitem__(name, value)

    def model_dump(self):
        result = {}
        for k, v in self.items():
            if hasattr(v, "model_dump"):
                result[k] = v.model_dump()
            else:
                result[k] = v
        return result

    def __dict__(self):
        return self.model_dump()

    @property
    def keys(self):
        if "keys" not in self:
            self["keys"] = DotObject({})

        return self["keys"]

    @property
    def items(self):
        if "items" not in self:
            self["items"] = DotObject({})
        return self["items"]

    @property
    def values(self):
        if "values" not in self:
            self["values"] = DotObject({})
        return self["values"]


class DotList(list):
    def __init__(self, iterable=None):
        super().__init__()
        if iterable:
            for item in iterable:
                super().append(DotObject(item))

    def append(self, item):
        super().append(DotObject(item))

    def extend(self, iterable):
        for item in iterable:
            self.append(item)

    def insert(self, index, item):
        super().insert(index, DotObject(item))

    def __setitem__(self, key, value):
        super().__setitem__(key, DotObject(value))

    def model_dump(self):
        return [v.model_dump() if hasattr(v, "model_dump") else v for v in self]

    def __dict__(self):
        return self.model_dump()


class DotList(list):
    def __init__(self, iterable=None):
        super().__init__()
        if iterable:
            for item in iterable:
                super().append(DotObject(item))  # recursive conversion

    def append(self, item):
        super().append(DotObject(item))

    def extend(self, iterable):
        for item in iterable:
            self.append(item)

    def insert(self, index, item):
        super().insert(index, DotObject(item))

    def __setitem__(self, key, value):
        super().__setitem__(key, DotObject(value))

    def model_dump(self):
        return [v.model_dump() if hasattr(v, "model_dump") else v for v in self]


def DotObject(data):
    if isinstance(data, Mapping):
        return DotDict({k: DotObject(v) for k, v in data.items()})
    elif isinstance(data, (list, tuple, set)):
        return DotList(DotObject(v) for v in data)
    return data


# @contextmanager
# def patched_json_dumps():

#     original_dumps = json.dumps

#     def dumps(obj, *args, **kwargs):
#         if isinstance(obj, (DotDict, DotList)):
#             return original_dumps(dict(obj), *args, **kwargs)

#         return original_dumps(obj, *args, **kwargs)

#     json.dumps = dumps
#     try:
#         yield
#     finally:
#         json.dumps = original_dumps


# if __name__ == "__main__":
#     with patched_json_dumps():
#         dd = DotDict(
#             {
#                 "a": 10,
#                 "b": 20,
#                 "__properties__": {"sum": "a + b"},
#                 "__setters__": {"a": "value * 2"},
#             }
#         )

#         print(dd.sum)  # Output: 30
#         dd.a = 15
#         print(dd.a)  # Output: 30
#         print(dd.sum)  # Output: 50

#         dd.k.d.f.keys = 6

#         print(dd.k.d.f.keys)

#         r = json.dumps(dd)
#         print(r)

#     r = json.dumps(dd)

#     print(r)
