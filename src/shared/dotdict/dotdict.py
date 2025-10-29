from dataclasses import dataclass
import ast
from typing import Any, Mapping


@dataclass
class Expression:
    code: str
    func: Any

    def __call__(self, *args, **kwargs):
        return self.func(*args, **kwargs)


class DotDict(dict):
    def __init__(self, dictionary=None):
        super().__init__()
        object.__setattr__(self, "_properties", {})
        object.__setattr__(self, "_setters", {})

        if dictionary is None:
            dictionary = {}
        dictionary = dict(dictionary)
        
        properties = dictionary.pop("__properties__", None)
        setters = dictionary.pop("__setters__", None)

        for key, value in dictionary.items():
            self[key] = value

        if properties:
            for k, v in properties.items():
                self.add_property(k, v)
        if setters:
            for k, v in setters.items():
                self.add_setter(k, v)

    def __setitem__(self, key, value):
        if key in self._setters:
            value = self._setters[key](value)
        super().__setitem__(key, DotObject(value))
        self._update_properties()

    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            raise AttributeError(f"'DotDict' object has no attribute '{key}'")

    def __setattr__(self, key, value):
        if key in {"_properties", "_setters"}:
            object.__setattr__(self, key, value)
        else:
            self[key] = value

    def update(self, *args, **kwargs):
        for key, value in dict(*args, **kwargs).items():
            self[key] = value

    def _update_properties(self):
        for key, expr_func in self._properties.items():
            super().__setitem__(key, expr_func())

    def add_property(self, name, code: str):
        try:
            compiled_expr = compile(ast.parse(code, mode="eval"), "<string>", "eval")
            func = lambda: eval(compiled_expr, {}, self)
            self._properties[name] = Expression(code=code, func=func)
            self._update_properties()
        except Exception as e:
            raise ValueError(f"Invalid expression for property '{name}': {e}") from e

    def add_setter(self, name, code: str):
        try:
            compiled_expr = compile(ast.parse(code, mode="eval"), "<string>", "eval")
            func = lambda value: eval(compiled_expr, {}, {**self, "value": value})
            self._setters[name] = Expression(code=code, func=func)
        except Exception as e:
            raise ValueError(f"Invalid expression for setter '{name}': {e}") from e

    def model_dump(self):
        return dict(self)


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


