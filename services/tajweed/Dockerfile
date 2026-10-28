# Free Hugging Face Space (Docker, CPU basic). Also runs anywhere Docker runs.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces run as user 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH HF_HOME=/home/user/.cache/huggingface PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Download the model into the image so the first check does not wait for it.
RUN python -c "from transformers import AutoFeatureExtractor; from quran_muaalem.modeling.modeling_multi_level_ctc import Wav2Vec2BertForMultilevelCTC as M; M.from_pretrained('obadx/muaalem-model-v3_2'); AutoFeatureExtractor.from_pretrained('obadx/muaalem-model-v3_2')"

COPY --chown=user app.py logic.py ./

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
