# Local semantic index

Generated from the repository's `bibles/KJV.json`; 31,102 verse vectors, 384 dimensions, normalized float32 little-endian. `manifest.json` pins source, vectors, verse metadata and model-file SHA-256 hashes. Never replace only the model or tokenizer: rebuild the embeddings with the same encoder configuration.

Runtime model: [Xenova/bge-small-en-v1.5 ONNX](https://huggingface.co/Xenova/bge-small-en-v1.5), quantized q8. Original model: [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5). Upstream MIT license is included in `BGE-LICENSE.txt`. Build/runtime uses Transformers.js 3.8.1, mean pooling, normalization, and the documented retrieval query prefix. Maximum document length is 256 tokens.

MiniLM is retained in the local model cache solely to reproduce the comparison; desktop packaging excludes that cache directory. The model/index is not trained or derived from Pewbeam assets. Runtime performs no remote model downloads or external embedding API calls.

`npm run build:semantic` regenerates comparison reports and the index; it may download missing public model files. `node scripts/evaluate-semantic-runtime.cjs` evaluates the actual offline worker against the authored development cases. Full build duration is around 24 minutes on the machine used for this run.

Include this directory and the Transformers.js/ONNX runtime dependencies when distributing the application. The runtime rejects checksum mismatches and abstains if assets are unavailable. The index supports English KJV only; adding another translation requires generating and validating a separate compatible index.
