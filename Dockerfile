FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json requirements.txt ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"
ENV PYTHON="/opt/venv/bin/python"
ENV PORT=3000

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
