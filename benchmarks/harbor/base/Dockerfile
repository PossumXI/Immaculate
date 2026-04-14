FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates curl git jq \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir harbor-rewardkit==0.1.2

WORKDIR /app
