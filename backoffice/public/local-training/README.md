# FAROAI local fine-tuning runner

For the steps after a run finishes, including what the LoRA adapter contains and what is still needed before FaroAI can call it, see [After training: next steps](./AFTER-TRAINING-NEXT-STEPS.md). The specification-only handoff for a Python inference server is in [python-inference-server](./python-inference-server/SPEC.md); it contains no example dataset.

The runner is a standalone Python script. Run it on the separate workstation that has the NVIDIA GPU. **Do not clone the FAROAI repository** onto that machine: it only needs the downloaded runner, one dependency file, and the approved JSONL dataset.

It does not connect to FAROAI, Qdrant, LM Studio, or a model provider. The script downloads the selected Transformers checkpoint from Hugging Face into the model-cache directory, then writes a LoRA adapter and a manifest to the output directory.

## Option A: Fine-tune Gemma 4 12B on a Windows workstation

### 1. Prepare the files from FAROAI

In Backoffice **Learning**:

1. Review and approve examples for local fine-tuning. Export the **local fine-tuning dataset**.
2. Download **training runner** (`train_lora.py`), **Gemma 4 QLoRA dependencies** (`requirements-gemma4.txt`), and this setup guide.
3. Copy those files and the exported `.jsonl` dataset to the training workstation using encrypted storage or an encrypted transfer.

The tenant-local export requires recorded tenant authorization, applicable customer/source consent, and human review. Hosted multi-tenant deployments are supported; each export contains only the selected tenant's data. See ADR-0012 and ADR-0023. Do not place the downloaded dataset in a shared folder or commit it to source control.

To create drafts from RAG knowledge, an operator with tenant authorization selects approved documents in Backoffice Learning. FaroAI sends those documents only to the tenant's configured local Ollama or LM Studio model. The model drafts question/answer pairs; a human must review and approve them before export. This draft step does not train model weights.

### 2. Check that the workstation is ready

- Windows 10/11 64-bit, Python 3.12 64-bit, and an NVIDIA GPU with CUDA-capable drivers.
- For Gemma 4 12B, use **24 GB VRAM as the target configuration** with the default 512-token sequence length and 4-bit QLoRA. This has not been validated on every GPU/driver combination; longer sequences require more memory.
- Have at least 16 GB system RAM and **60 GB free disk** for the Transformers checkpoint, cache, dependencies, and output. The Hugging Face checkpoint download is large even though it is loaded in 4-bit for training.
- Close or unload any model in LM Studio before training.

Open PowerShell and confirm Python and the NVIDIA driver are visible:

```powershell
py -3.12 --version
nvidia-smi
```

If `py -3.12` is missing, install 64-bit Python 3.12 on that workstation. If `nvidia-smi` is missing or shows no GPU, fix the NVIDIA driver before installing the training libraries.

### 3. Put the downloaded files in a working folder

For example, create this layout on a drive with enough free space:

```text
D:\FaroTraining\
  runner\
    train_lora.py
    requirements-gemma4.txt
  data\
    faroai-dataset.jsonl
  model-cache\
  runs\
```

No FAROAI application source, Docker image, database, or Qdrant collection is needed on the training workstation.

### 4. Create an isolated Python environment

In PowerShell:

```powershell
Set-Location D:\FaroTraining\runner
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip --no-cache-dir
```

Install a CUDA-enabled PyTorch build using the command selected for **Windows / Pip / Python / CUDA** on the [official PyTorch install page](https://pytorch.org/get-started/locally/). Run that command inside the activated `.venv`. Then install the Gemma 4 dependencies without retaining pip's package download cache:

```powershell
python -m pip install --no-cache-dir -r .\requirements-gemma4.txt
```

Confirm that this Python environment can see CUDA:

```powershell
python -c "import torch; print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'not detected')"
```

Continue only when it prints `CUDA: True` and the expected NVIDIA GPU name.

### 5. Start a Gemma 4 QLoRA run

```powershell
python .\train_lora.py `
  --dataset D:\FaroTraining\data\faroai-dataset.jsonl `
  --model google/gemma-4-12B-it `
  --model-family gemma4 `
  --qlora-4bit `
  --model-cache-dir D:\FaroTraining\model-cache `
  --output-dir D:\FaroTraining\runs\gemma4-12b-first `
  --epochs 1 `
  --max-sequence-length 512
```

The first run downloads the Transformers/Safetensors checkpoint from Hugging Face into `D:\FaroTraining\model-cache`; it does **not** download the GGUF/QAT runtime file from LM Studio. The training profile quantizes the base model to 4-bit NF4 in memory and trains a LoRA adapter. It accepts the current text-only `messages` JSONL format; image/audio/video training examples are not supported by this runner.

Do not interrupt the run if you need its final adapter. The current runner saves at the end of training and does not resume an interrupted run. Keep the computer powered and allow enough free disk space.

### 6. Locate and retain the result

On completion, inspect:

```text
D:\FaroTraining\runs\gemma4-12b-first\
  adapter\
  training-manifest.json
```

The adapter is not a complete standalone model and is not automatically loaded into LM Studio. Keep the dataset, manifest, and adapter on encrypted storage according to the tenant's retention policy. Evaluate the adapter before any conversion or use. Merging/converting a 12B model is a separate step and may need substantially more system RAM and disk than the training run.

## Option B: Existing small-model LoRA starter

For the default small-model path, download `train_lora.py`, `requirements.txt`, and an approved JSONL dataset from Learning. Create a Python 3.12 virtual environment as above, install PyTorch using the official selector, then run:

```powershell
python -m pip install --no-cache-dir -r .\requirements.txt
python .\train_lora.py `
  --dataset D:\FaroTraining\data\faroai-dataset.jsonl `
  --model Qwen/Qwen2.5-0.5B-Instruct `
  --model-cache-dir D:\FaroTraining\model-cache `
  --output-dir D:\FaroTraining\runs\qwen-0.5b
```

## What the runner does not do

- It does not install Python. Python must already be installed on the workstation.
- It does not require cloning or installing the FAROAI application.
- It does not train from the GGUF/QAT file that LM Studio downloads. Use the Transformers base model ID shown in the command.
- It does not run inside FaroAI, read FaroAI databases, call Qdrant, send data to a hosted model, or publish the adapter.
- It does not train on image inputs yet. Gemma 4 is multimodal, but this starter feeds the reviewed text pairs only.
- It does not evaluate, merge, convert, or deploy the adapter automatically.

The Gemma profile follows the [Google Transformers + QLoRA guide](https://ai.google.dev/gemma/docs/core/huggingface_text_finetune_qlora) and the [`google/gemma-4-12B-it` model card](https://huggingface.co/google/gemma-4-12B-it). Check those sources again before changing the model family or dependencies.
