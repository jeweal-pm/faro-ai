FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir \
      'reportlab==4.4.9' \
      'openpyxl==3.1.5' \
      'python-docx==1.2.0' \
      'python-pptx==1.0.2' \
      'psycopg[binary]>=3.2,<4' \
      'redis>=5,<7' \
    && groupadd --system --gid 10002 artifact \
    && useradd --system --uid 10002 --gid artifact --no-create-home artifact \
    && install -d -m 0750 -o 10002 -g 10002 /var/faroai/artifacts

WORKDIR /app
COPY --chown=10002:10002 . /app/
USER 10002:10002
CMD ["python", "-m", "artifact_worker"]
