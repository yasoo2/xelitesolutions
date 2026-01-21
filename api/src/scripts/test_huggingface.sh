# Test HuggingFace Provider

echo "Testing HuggingFace Provider..."
echo ""

# Note: Needs HUGGINGFACE_API_KEY in .env
# Get free key at: https://huggingface.co/settings/tokens

curl -s "https://api-inference.huggingface.co/v1/chat/completions" \
  -H "Authorization: Bearer ${HUGGINGFACE_API_KEY:-hf_dummy}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Meta-Llama-3-70B-Instruct",
    "messages": [
      {"role": "user", "content": "Say hello in one word"}
    ],
    "max_tokens": 10
  }' | head -20

echo ""
echo "If you see 401 error, add HUGGINGFACE_API_KEY to .env"
echo "Get key at: https://huggingface.co/settings/tokens"
