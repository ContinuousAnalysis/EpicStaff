FROM python:3.12-slim
RUN pip install poetry
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 POETRY_NO_INTERACTION=1
WORKDIR /app
COPY pyproject.toml poetry.lock* ./
RUN poetry config virtualenvs.create false && poetry install --no-root
COPY app/ ./app/
COPY run.py .
EXPOSE 8060
CMD ["python", "run.py"]
