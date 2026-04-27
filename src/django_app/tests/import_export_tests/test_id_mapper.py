import pytest

from tables.import_export.id_mapper import IDMapper


@pytest.mark.django_db
class TestIDMapper:
    def test_map_and_get(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100)
        assert mapper.get("Agent", 1) == 100

    def test_get_missing_raises_value_error(self):
        mapper = IDMapper()
        with pytest.raises(ValueError, match="No mapping found"):
            mapper.get("Agent", 999)

    def test_get_or_none_returns_none_when_missing(self):
        mapper = IDMapper()
        assert mapper.get_or_none("Agent", 999) is None

    def test_get_or_none_returns_id(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100)
        assert mapper.get_or_none("Agent", 1) == 100

    def test_has_mapping(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100)
        assert mapper.has_mapping("Agent", 1) is True
        assert mapper.has_mapping("Agent", 2) is False

    def test_was_created_true(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100, was_created=True)
        assert mapper.was_created("Agent", 1) is True

    def test_was_created_false(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100, was_created=False)
        assert mapper.was_created("Agent", 1) is False

    def test_was_created_missing_raises(self):
        mapper = IDMapper()
        with pytest.raises(ValueError, match="No mapping found"):
            mapper.was_created("Agent", 999)

    def test_get_created_count(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100, was_created=True)
        mapper.map("Agent", 2, 200, was_created=False)
        mapper.map("Agent", 3, 300, was_created=True)
        assert mapper.get_created_count("Agent") == 2

    def test_get_reused_count(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100, was_created=True)
        mapper.map("Agent", 2, 200, was_created=False)
        mapper.map("Agent", 3, 300, was_created=False)
        assert mapper.get_reused_count("Agent") == 2

    def test_get_new_ids(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100)
        mapper.map("Agent", 2, 200)
        assert sorted(mapper.get_new_ids("Agent")) == [100, 200]

    def test_get_created_ids(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100, was_created=True)
        mapper.map("Agent", 2, 200, was_created=False)
        assert mapper.get_created_ids("Agent") == [100]

    def test_get_reused_ids(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100, was_created=True)
        mapper.map("Agent", 2, 200, was_created=False)
        assert mapper.get_reused_ids("Agent") == [200]

    def test_multiple_entity_types_isolated(self):
        mapper = IDMapper()
        mapper.map("Agent", 1, 100)
        mapper.map("LLMConfig", 1, 500)
        assert mapper.get("Agent", 1) == 100
        assert mapper.get("LLMConfig", 1) == 500
        assert mapper.has_mapping("Agent", 1) is True
        assert mapper.has_mapping("LLMConfig", 1) is True
        assert mapper.get_or_none("Agent", 2) is None
