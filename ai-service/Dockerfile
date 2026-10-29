FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY pyproject.toml ./
RUN python -c "import subprocess, tomllib; deps = tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']; subprocess.check_call(['pip', 'install', '--no-cache-dir', *deps])"
ARG EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='${EMBEDDING_MODEL}', cache_dir='/opt/fastembed')"
COPY faroai ./faroai
RUN pip install --no-cache-dir --no-deps . \
    && useradd --system --uid 10001 --create-home faroai \
    && chown -R faroai:faroai /app /opt/fastembed
ENV EMBEDDING_CACHE_DIR=/opt/fastembed HF_HUB_OFFLINE=1
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "faroai.app:app", "--host", "0.0.0.0", "--port", "8000"]
