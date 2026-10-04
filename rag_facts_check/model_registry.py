"""
Centralized LLM model registry for the RAG Facts Check service.

Single source of truth for:
- the model catalog shown by the frontend (served via ``GET /models``),
- the server-side allowlist used to validate per-request model selection.

Security: the frontend may *request* a model id, but only ids present in
:data:`ALLOWED_MODEL_IDS` are ever sent to the LLM provider. Arbitrary
client-supplied model strings are rejected with HTTP 422. Provider
credentials never leave the backend.

The catalog below is the EXACT supplied free-model list (54 models).
Capabilities are derived strictly from the supplied descriptions — nothing
is invented. Models that cannot perform text fact-checking (image
generation, translation-only) carry ``supported_for_fact_checking=False``
so they are listed but never selectable for verification.
"""

from dataclasses import asdict, dataclass

#: Model used when the client does not select one (and the env default).
DEFAULT_MODEL_ID = "qwen/qwen3.8-omni-flash:free"

# Capability vocabulary used by the UI badge renderer.
CAP_TEXT = "text"
CAP_VISION = "vision"
CAP_AUDIO = "audio"
CAP_VIDEO = "video"
CAP_REASONING = "reasoning"
CAP_CODING = "coding"
CAP_TRANSLATION = "translation"
CAP_IMAGE_GEN = "image-generation"


@dataclass(frozen=True)
class ModelInfo:
    """Public metadata for one selectable model.

    Only non-sensitive fields live here — nothing in this record may
    contain credentials or provider-internal configuration.
    """

    id: str
    provider: str
    name: str
    description: str
    context: str
    free: bool
    capabilities: tuple[str, ...]
    recommended: bool = False
    experimental: bool = False
    default: bool = False
    supported_for_fact_checking: bool = True
    #: Optional specialization label shown as a badge (e.g. "Health",
    #: "Translation", "Image Generation"). None for general-purpose models.
    specialization: str | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["capabilities"] = list(self.capabilities)
        return d


#: Curated catalog — the supplied 54 free models, grouped by provider.
MODELS: list[ModelInfo] = [
    # ───────────────────────────── Qwen ─────────────────────────────
    ModelInfo(
        id="qwen/qwen3.8-omni-flash:free",
        provider="Qwen",
        name="Qwen3.8 Omni Flash",
        description=(
            "Qwen3.8 Omni Flash is the latest natively multimodal model in "
            "Alibaba's Qwen3.8 series — unified text, image, video and audio "
            "understanding with a 1M-token context window and thinking support."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_AUDIO, CAP_VIDEO, CAP_REASONING),
        recommended=True,
        default=True,
    ),
    ModelInfo(
        id="qwen/qwen3.8-max:free",
        provider="Qwen",
        name="Qwen3.8 Max",
        description=(
            "Qwen3.8 Max is the flagship model in Alibaba's Qwen3.8 series, "
            "the general-availability successor to the Qwen3.8 Max Preview."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
        recommended=True,
    ),
    ModelInfo(
        id="qwen/qwen3.7-max:free",
        provider="Qwen",
        name="Qwen3.7 Max",
        description="Qwen3.7-Max is the flagship model in Alibaba's Qwen3.7 series.",
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
        recommended=True,
    ),
    ModelInfo(
        id="qwen/qwen3.7-plus:free",
        provider="Qwen",
        name="Qwen3.7 Plus",
        description="Qwen3.7-Plus is a cost-effective model in Alibaba's Qwen3.7 series.",
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.7-flash:free",
        provider="Qwen",
        name="Qwen3.7 Flash",
        description="Qwen3.7 Flash is a vision-language reasoning model from Alibaba.",
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.6-plus:free",
        provider="Qwen",
        name="Qwen3.6 Plus",
        description=(
            "Qwen 3.6 Plus builds on a hybrid architecture that combines "
            "efficient linear attention with sparse mixture-of-experts routing, "
            "enabling strong scalability and high-performance inference."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.6-max-preview:free",
        provider="Qwen",
        name="Qwen3.6 Max Preview",
        description=(
            "Qwen3.6-Max-Preview is a proprietary frontier model from Alibaba "
            "Cloud built on a sparse mixture-of-experts architecture with "
            "approximately 1 trillion total parameters."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
        experimental=True,
    ),
    ModelInfo(
        id="qwen/qwen3.6-27b:free",
        provider="Qwen",
        name="Qwen3.6 27B",
        description=(
            "Qwen3.6 27B is a dense 27-billion-parameter language model from "
            "the Qwen Team at Alibaba, released in April 2026."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.5-plus:free",
        provider="Qwen",
        name="Qwen3.5 Plus",
        description="Qwen3.5 Plus from Alibaba's Qwen series.",
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.5-omni-plus:free",
        provider="Qwen",
        name="Qwen3.5 Omni Plus",
        description=(
            "Qwen3.5 Omni Plus is Alibaba's most capable natively multimodal "
            "model, handling text, image, audio and audio-video understanding "
            "with state-of-the-art results across audio benchmarks."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_AUDIO, CAP_VIDEO, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.6-35b-a3b:free",
        provider="Qwen",
        name="Qwen3.6 35B A3B",
        description=(
            "Qwen3.6-35B-A3B is an open-weight multimodal model from Alibaba "
            "Cloud with 35 billion total parameters and 3 billion active "
            "parameters per token."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.5-flash:free",
        provider="Qwen",
        name="Qwen3.5 Flash",
        description="Qwen3.5 Flash from Alibaba's Qwen series.",
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.5-397b-a17b:free",
        provider="Qwen",
        name="Qwen3.5 397B A17B",
        description=(
            "The Qwen3.5 series 397B-A17B native vision-language model is "
            "built on a hybrid architecture that integrates a linear attention "
            "mechanism with a sparse mixture-of-experts model, achieving higher "
            "inference efficiency."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3.5-omni-flash:free",
        provider="Qwen",
        name="Qwen3.5 Omni Flash",
        description=(
            "Qwen3.5 Omni Flash is the efficient omni-modal model of the "
            "Qwen3.5 series, supporting text, image, video and audio "
            "understanding with a long context window."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_AUDIO, CAP_VIDEO, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3-max:free",
        provider="Qwen",
        name="Qwen3 Max",
        description=(
            "Qwen3-Max is an updated release built on the Qwen3 series, offering "
            "major improvements in reasoning, instruction following, "
            "multilingual support, and long-tail knowledge coverage compared to "
            "the January 2025 version."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen-plus-2025-07-28:free",
        provider="Qwen",
        name="Qwen Plus 0728",
        description=(
            "Qwen Plus 0728, based on the Qwen3 foundation model, is a 1 "
            "million context hybrid reasoning model with a balanced performance, "
            "speed, and cost combination."
        ),
        context="131K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="qwen/qwen3-coder-plus:free",
        provider="Qwen",
        name="Qwen3 Coder Plus",
        description=(
            "Qwen3 Coder Plus is Alibaba's proprietary version of the Open "
            "Source Qwen3 Coder 480B A35B."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING),
        specialization="Coding",
    ),
    ModelInfo(
        id="qwen/qwen3-vl-plus:free",
        provider="Qwen",
        name="Qwen3 VL Plus",
        description=(
            "Qwen3-VL is Alibaba's vision-language flagship, combining text and "
            "vision without trade-offs. Strong at visual reasoning, OCR, spatial "
            "understanding and GUI agent tasks."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_REASONING),
        recommended=True,
    ),
    ModelInfo(
        id="qwen/qwen3-omni-flash:free",
        provider="Qwen",
        name="Qwen3 Omni Flash",
        description=(
            "Qwen3 Omni Flash is Alibaba's natively omni-modal model, accepting "
            "text, image, video and audio input with strong results across "
            "audio and audio-visual benchmarks."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_AUDIO, CAP_VIDEO, CAP_REASONING),
    ),
    # ───────────────────────────── Mistral ─────────────────────────────
    ModelInfo(
        id="mistralai/mistral-large-2512",
        provider="Mistral",
        name="Mistral Large 3",
        description=(
            "Mistral's most capable model — a sparse mixture-of-experts with "
            "41B active (675B total) parameters."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
        recommended=True,
    ),
    ModelInfo(
        id="mistralai/mistral-medium-3.5",
        provider="Mistral",
        name="Mistral Medium 3.5",
        description=(
            "A dense 128B instruction-following model from Mistral AI for "
            "agentic workflows, coding, and complex tasks with text and image "
            "inputs."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_CODING),
        recommended=True,
    ),
    ModelInfo(
        id="mistralai/mistral-small-2603",
        provider="Mistral",
        name="Mistral Small 4",
        description=(
            "Mistral's hybrid model unifying instruct, reasoning, and coding "
            "in a single efficient model."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING, CAP_CODING),
    ),
    ModelInfo(
        id="mistralai/codestral-2508",
        provider="Mistral",
        name="Codestral",
        description=(
            "Mistral's cutting-edge coding model for low-latency tasks such as "
            "fill-in-the-middle, code correction, and test generation."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING),
        specialization="Coding",
    ),
    ModelInfo(
        id="mistralai/devstral-medium",
        provider="Mistral",
        name="Devstral 2",
        description=(
            "A high-performance code-generation and agentic model developed by "
            "Mistral AI and All Hands AI (not a thinking/reasoning model)."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING),
        specialization="Coding",
    ),
    ModelInfo(
        id="mistralai/ministral-14b",
        provider="Mistral",
        name="Ministral 3 14B",
        description=(
            "Ministral 3 (Tinystral) 14B — a best-in-class small model with "
            "text and vision."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION),
    ),
    ModelInfo(
        id="mistralai/ministral-8b",
        provider="Mistral",
        name="Ministral 3 8B",
        description=(
            "Ministral 3 (Tinystral) 8B — an efficient small model with text "
            "and vision."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION),
    ),
    ModelInfo(
        id="mistralai/ministral-3b",
        provider="Mistral",
        name="Ministral 3 3B",
        description=(
            "Ministral 3 (Tinystral) 3B — a tiny, ultra-cheap model with text "
            "and vision."
        ),
        context="128K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION),
    ),
    # ───────────────────────────── Apodex ─────────────────────────────
    ModelInfo(
        id="apodex/apodex-1.1-mini:free",
        provider="Apodex",
        name="Apodex 1.1 Mini",
        description=(
            "Apodex 1.1 Mini is a reasoning-first model from Apodex, built for "
            "complex, long-horizon research and forecasting tasks. It works "
            "directly with files, data, code, and tools to produce verifiable "
            "results."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    # ───────────────────────────── Meituan ─────────────────────────────
    ModelInfo(
        id="meituan/longcat-2.5-preview:free",
        provider="Meituan",
        name="LongCat 2.5 Preview",
        description=(
            "LongCat 2.5 Preview is an early-access sparse mixture-of-experts "
            "model from Meituan built for coding and long-horizon agentic "
            "workflows, offered on a free tier with a 1M-token context."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING, CAP_REASONING),
        experimental=True,
    ),
    ModelInfo(
        id="meituan/longcat-2.0",
        provider="Meituan",
        name="LongCat 2.0",
        description=(
            "LongCat 2.0 is a sparse mixture-of-experts model from Meituan with "
            "48B active parameters out of 1.6T total, built for coding, "
            "repository-level changes, long-horizon problem solving, and "
            "agentic workflows."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING, CAP_REASONING),
    ),
    # ───────────────────────────── Stealth ─────────────────────────────
    ModelInfo(
        id="stealth/big-pickle",
        provider="Stealth",
        name="Big Pickle",
        description=(
            "Big Pickle is an anonymous stealth coding model served through the "
            "OpenCode client, with tool calling and a 200K-token context "
            "window, offered on a free tier."
        ),
        context="200K",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING),
        specialization="Coding",
        experimental=True,
    ),
    ModelInfo(
        id="stealth/space-bunny-alpha:free",
        provider="Stealth",
        name="Space Bunny Alpha",
        description=(
            "Space Bunny Alpha is an anonymous stealth model with fast "
            "inference, strong coding capabilities, image input and a 1M-token "
            "context window, offered on a free, rate-limited tier."
        ),
        context="1M",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING, CAP_VISION),
        experimental=True,
    ),
    # ───────────────────────────── Dots Studio ─────────────────────────────
    ModelInfo(
        id="dots-studio/dots-3-note-preview:free",
        provider="Dots Studio",
        name="Dots3-Note Preview",
        description=(
            "Dots3-Note Preview is an open-weight mixture-of-experts model from "
            "Dots Studio, with 16B active parameters out of 280B total."
        ),
        context="512K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
        experimental=True,
    ),
    # ───────────────────────────── InclusionAI ─────────────────────────────
    ModelInfo(
        id="inclusionai/ling-3.0-flash-sante:free",
        provider="InclusionAI",
        name="Ling 3.0 Flash Sante",
        description=(
            "Ling 3.0 Flash Sante is a health and medicine-focused "
            "mixture-of-experts model from InclusionAI, built on Ling 3.0 Flash "
            "with 5.1B active parameters out of 124B total."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
        specialization="Health & Medicine",
    ),
    # ───────────────────────────── Liquid AI ─────────────────────────────
    ModelInfo(
        id="liquid/lfm-2.5-2.6b:free",
        provider="Liquid AI",
        name="LFM2.5-2.6B",
        description="LFM2.5-2.6B is a compact reasoning model from Liquid AI.",
        context="65K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    # ───────────────────────────── SenseNova ─────────────────────────────
    ModelInfo(
        id="sensenova/sensenova-6.8-flash-lite",
        provider="SenseNova",
        name="SenseNova 6.8 Flash-Lite",
        description=(
            "SenseNova 6.8 Flash-Lite is a lightweight multimodal agent model "
            "designed for real-world workflows, supporting text conversation "
            "and image input understanding."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION),
    ),
    ModelInfo(
        id="sensenova/sensenova-6.7-flash-lite",
        provider="SenseNova",
        name="SenseNova 6.7 Flash-Lite",
        description=(
            "SenseNova 6.7 Flash-Lite is a lightweight multimodal agent model "
            "designed for real-world workflows, supporting text conversation "
            "and image input understanding."
        ),
        context="262K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION),
    ),
    ModelInfo(
        id="sensenova/sensenova-u1.5-lite",
        provider="SenseNova",
        name="SenseNova U1.5 Lite",
        description=(
            "Our latest image creation model built on Neo-unify architecture, "
            "combining generation and editing with reference images."
        ),
        context="—",
        free=True,
        capabilities=(CAP_IMAGE_GEN,),
        specialization="Image Generation",
        supported_for_fact_checking=False,
    ),
    # ───────────────────────────── Cohere ─────────────────────────────
    ModelInfo(
        id="cohere/command-a-plus",
        provider="Cohere",
        name="Command A+",
        description=(
            "Command A+ is Cohere's flagship model for enterprise agentic "
            "workflows, accepting text and image input with native tool calling "
            "and built-in reasoning."
        ),
        context="436K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_REASONING),
        recommended=True,
    ),
    ModelInfo(
        id="cohere/north-mini-code",
        provider="Cohere",
        name="North Mini Code",
        description=(
            "North Mini Code is Cohere's first agentic coding model and the "
            "debut of its North family, a sparse mixture-of-experts model with "
            "30B total and 3B active parameters."
        ),
        context="256K",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING),
        specialization="Coding",
    ),
    ModelInfo(
        id="cohere/command-a-reasoning",
        provider="Cohere",
        name="Command A Reasoning",
        description=(
            "Command A Reasoning is Cohere's first reasoning model, able to "
            "think before generating an output, with tool use for agentic "
            "workflows."
        ),
        context="288K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="cohere/command-a-vision",
        provider="Cohere",
        name="Command A Vision",
        description=(
            "Command A Vision is Cohere's first model capable of processing "
            "images, excelling at charts, graphs, diagrams, OCR and document "
            "question answering."
        ),
        context="128K",
        free=True,
        capabilities=(CAP_TEXT, CAP_VISION, CAP_REASONING),
    ),
    ModelInfo(
        id="cohere/command-a",
        provider="Cohere",
        name="Command A",
        description=(
            "Command A is an open-weights 111B parameter model focused on "
            "delivering great performance across agentic, multilingual, and "
            "coding use cases."
        ),
        context="288K",
        free=True,
        capabilities=(CAP_TEXT, CAP_CODING, CAP_REASONING),
    ),
    ModelInfo(
        id="cohere/command-a-translate",
        provider="Cohere",
        name="Command A Translate",
        description=(
            "Command A Translate is Cohere's state-of-the-art machine "
            "translation model, covering 23 languages."
        ),
        context="8K",
        free=True,
        capabilities=(CAP_TEXT, CAP_TRANSLATION),
        specialization="Translation",
        supported_for_fact_checking=False,
    ),
    ModelInfo(
        id="cohere/north-small-translate",
        provider="Cohere",
        name="North Small Translate",
        description=(
            "North Small Translate is a 218B-total, 25B-active "
            "mixture-of-experts model purpose-built for machine translation "
            "across more than 50 languages."
        ),
        context="32K",
        free=True,
        capabilities=(CAP_TEXT, CAP_TRANSLATION),
        specialization="Translation",
        supported_for_fact_checking=False,
    ),
    ModelInfo(
        id="cohere/command-r-plus-08-2024",
        provider="Cohere",
        name="Command R+ (08-2024)",
        description=(
            "command-r-plus-08-2024 is an update of the Command R+ with roughly "
            "50% higher throughput and 25% lower latencies as compared to the "
            "previous Command R+ version."
        ),
        context="128K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="cohere/command-r-08-2024",
        provider="Cohere",
        name="Command R (08-2024)",
        description=(
            "command-r-08-2024 is an update of the Command R with improved "
            "performance for multilingual retrieval-augmented generation (RAG) "
            "and tool use."
        ),
        context="128K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="cohere/command-r7b-12-2024",
        provider="Cohere",
        name="Command R7B (12-2024)",
        description=(
            "Command R7B (12-2024) is a small, fast update of the Command R+ "
            "model, delivered in December 2024."
        ),
        context="132K",
        free=True,
        capabilities=(CAP_TEXT, CAP_REASONING),
    ),
    ModelInfo(
        id="cohere/aya-expanse-32b",
        provider="Cohere",
        name="Aya Expanse 32B",
        description=(
            "Aya Expanse 32B is a highly performant 32B multilingual model "
            "serving 23 languages."
        ),
        context="128K",
        free=True,
        capabilities=(CAP_TEXT,),
    ),
    ModelInfo(
        id="cohere/aya-vision-32b",
        provider="Cohere",
        name="Aya Vision 32B",
        description=(
            "Aya Vision 32B is a 32B multilingual model serving 23 languages. "
            "Image input is currently not available for this model."
        ),
        context="16K",
        free=True,
        capabilities=(CAP_TEXT,),
    ),
    ModelInfo(
        id="cohere/tiny-aya-global",
        provider="Cohere",
        name="Tiny Aya Global",
        description=(
            "Tiny Aya Global is a 3.35B instruction-tuned multilingual model "
            "with the best balance across its 70 supported languages."
        ),
        context="8K",
        free=True,
        capabilities=(CAP_TEXT,),
    ),
    ModelInfo(
        id="cohere/tiny-aya-earth",
        provider="Cohere",
        name="Tiny Aya Earth",
        description=(
            "Tiny Aya Earth is a 3.35B region-specialized multilingual model, "
            "best for West Asian and African languages, supporting 70 languages."
        ),
        context="8K",
        free=True,
        capabilities=(CAP_TEXT,),
    ),
    ModelInfo(
        id="cohere/tiny-aya-fire",
        provider="Cohere",
        name="Tiny Aya Fire",
        description=(
            "Tiny Aya Fire is a 3.35B region-specialized multilingual model, "
            "best for South Asian languages, supporting 70 languages."
        ),
        context="8K",
        free=True,
        capabilities=(CAP_TEXT,),
    ),
    ModelInfo(
        id="cohere/tiny-aya-water",
        provider="Cohere",
        name="Tiny Aya Water",
        description=(
            "Tiny Aya Water is a 3.35B region-specialized multilingual model, "
            "best for European and Asia-Pacific languages, supporting 70 "
            "languages."
        ),
        context="8K",
        free=True,
        capabilities=(CAP_TEXT,),
    ),
]

MODEL_REGISTRY: dict[str, ModelInfo] = {m.id: m for m in MODELS}

#: Server-side allowlist. ONLY these ids may be passed to the LLM provider.
#: Image-generation and translation-only models are excluded — they cannot
#: perform text fact-checking.
ALLOWED_MODEL_IDS: frozenset[str] = frozenset(
    m.id for m in MODELS if m.supported_for_fact_checking
)

#: Models surfaced in the "Recommended for Fact Checking" section, ordered.
RECOMMENDED_MODEL_IDS: list[str] = [m.id for m in MODELS if m.recommended]

#: Canonical provider display order for the browser.
PROVIDER_ORDER: list[str] = [
    "Qwen",
    "Mistral",
    "Cohere",
    "Meituan",
    "Apodex",
    "Stealth",
    "SenseNova",
    "Dots Studio",
    "InclusionAI",
    "Liquid AI",
]


def is_allowed_model(model_id: str | None) -> bool:
    """True when *model_id* is on the fact-checking allowlist."""
    return model_id in ALLOWED_MODEL_IDS


def resolve_model(requested: str | None) -> str:
    """Return the model id to use for a verification.

    Falls back to :data:`DEFAULT_MODEL_ID` when nothing is requested.
    Raises ``ValueError`` for ids outside the allowlist — callers should
    translate that into HTTP 422.
    """
    if not requested:
        return DEFAULT_MODEL_ID
    if requested not in ALLOWED_MODEL_IDS:
        raise ValueError(f"Model {requested!r} is not available for fact checking.")
    return requested


def catalog_for_client() -> list[dict]:
    """Public catalog (no secrets) for ``GET /models``."""
    return [m.to_dict() for m in MODELS]
