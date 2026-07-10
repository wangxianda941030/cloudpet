FROM python:3.12-alpine
RUN apk add --no-cache procps
WORKDIR /app
COPY agent.py .
USER root
EXPOSE 6120
CMD ["python3", "agent.py"]
