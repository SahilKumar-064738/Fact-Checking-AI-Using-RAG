"""Tests for the centralized model registry and server-side allowlist."""

from rag_facts_check.model_registry import (
    DEFAULT_MODEL_ID,
    MODEL_REGISTRY,
    MODELS,
    PROVIDER_ORDER,
    RECOMMENDED_MODEL_IDS,
    catalog_for_client,
    is_allowed_model,
    resolve_model,
)


class TestCatalogIntegrity:
    def test_catalog_has_54_models(self):
        """The supplied catalog contains exactly 54 models."""
        assert len(MODELS) == 54

    def test_ids_are_unique(self):
        assert len({m.id for m in MODELS}) == len(MODELS)

    def test_default_model_is_qwen_omni_flash(self):
        assert DEFAULT_MODEL_ID == "qwen/qwen3.8-omni-flash:free"
        default = MODEL_REGISTRY[DEFAULT_MODEL_ID]
        assert default.default is True
        assert default.recommended is True
        assert default.provider == "Qwen"

    def test_recommended_default_is_first_recommended(self):
        """Recommended section must lead with the default model."""
        assert RECOMMENDED_MODEL_IDS[0] == DEFAULT_MODEL_ID

    def test_every_provider_in_order_list(self):
        for m in MODELS:
            assert m.provider in PROVIDER_ORDER, m.provider

    def test_no_secrets_in_catalog(self):
        for m in catalog_for_client():
            flat = str(m)
            assert "sk-" not in flat
            assert "api_key" not in flat.lower()

    def test_specialized_models_are_flagged(self):
        """Translation/image-generation models never claim compatibility."""
        by_id = MODEL_REGISTRY
        assert by_id["sensenova/sensenova-u1.5-lite"].supported_for_fact_checking is False
        assert "image-generation" in by_id["sensenova/sensenova-u1.5-lite"].capabilities
        assert by_id["cohere/command-a-translate"].supported_for_fact_checking is False
        assert by_id["cohere/north-small-translate"].supported_for_fact_checking is False


class TestAllowlist:
    def test_default_model_is_allowed(self):
        assert is_allowed_model(DEFAULT_MODEL_ID)

    def test_unsupported_models_excluded_from_allowlist(self):
        assert not is_allowed_model("sensenova/sensenova-u1.5-lite")
        assert not is_allowed_model("cohere/command-a-translate")
        assert not is_allowed_model("cohere/north-small-translate")

    def test_arbitrary_ids_rejected(self):
        assert not is_allowed_model("evil/model")
        assert not is_allowed_model("")
        assert not is_allowed_model(None)

    def test_resolve_falls_back_to_default(self):
        assert resolve_model(None) == DEFAULT_MODEL_ID
        assert resolve_model("") == DEFAULT_MODEL_ID

    def test_resolve_accepts_allowlisted_id(self):
        assert resolve_model("qwen/qwen3.8-max:free") == "qwen/qwen3.8-max:free"

    def test_resolve_rejects_unknown_id(self):
        import pytest

        with pytest.raises(ValueError):
            resolve_model("qwen/qwen3.8-max:free; DROP TABLE models")
        with pytest.raises(ValueError):
            resolve_model("sensenova/sensenova-u1.5-lite")  # image-gen only

    def test_meta_models_not_in_catalog(self):
        """Muse Spark 1.2/1.3 are paying-only and must be excluded."""
        assert not any("muse-spark" in m.id for m in MODELS)
