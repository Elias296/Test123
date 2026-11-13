# Tizian-Server für einen kostenlosen Hugging-Face-Space (Docker, CPU basic)
# llama.cpp-Server mit OpenAI-kompatibler Schnittstelle: POST /v1/chat/completions
FROM ghcr.io/ggml-org/llama.cpp:server

# Modell wird beim ersten Start von Hugging Face geladen (ca. 1 GB) und zwischengespeichert.
# Kleiner und schneller, aber schwächer: Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M
ENV MODEL=Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M
ENV LLAMA_CACHE=/tmp/llama-cache
EXPOSE 7860

# Optional: Secret API_KEY im Space anlegen -> der Server verlangt dann diesen Schlüssel.
ENTRYPOINT ["/bin/sh", "-c", "exec /app/llama-server -hf \"$MODEL\" --host 0.0.0.0 --port 7860 -c 4096 -t 2 ${API_KEY:+--api-key \"$API_KEY\"}"]
