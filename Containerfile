FROM localhost/mcp-adapter:latest

# Copy the planka-mcp server source
COPY dist/ /opt/planka-mcp/
COPY node_modules/ /opt/planka-mcp/node_modules/

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -sf http://localhost:8080/health || exit 1

ENTRYPOINT ["python", "/app/adapter.py"]
CMD ["--port", "8080", "--host", "0.0.0.0", "--", "/usr/bin/node", "/opt/planka-mcp/index.js"]
