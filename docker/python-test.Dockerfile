FROM python:3.11-alpine

RUN pip install --break-system-packages pytest behave

WORKDIR /code

CMD ["python3"]