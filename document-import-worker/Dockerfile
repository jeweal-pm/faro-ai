FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata \
    OMP_THREAD_LIMIT=1 \
    HOME=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      tesseract-ocr=5.3.0-2 \
      tesseract-ocr-eng=1:4.1.0-2 \
      tesseract-ocr-tha=1:4.1.0-2 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir --disable-pip-version-check \
      'pypdfium2==5.15.2' \
      'Pillow==13.0.0' \
      'cryptography==50.0.2' \
      'psycopg[binary]==3.3.6' \
    && groupadd --system --gid 1000 document-import \
    && useradd --system --uid 1000 --gid document-import --no-create-home document-import \
    && install -d -m 0700 -o 1000 -g 1000 \
      /var/faroai/document-import/source \
      /var/faroai/document-import/previews \
      /tmp

WORKDIR /app
COPY --chown=1000:1000 . /app/
USER 1000:1000
CMD ["python", "/app/document_import_worker.py"]
