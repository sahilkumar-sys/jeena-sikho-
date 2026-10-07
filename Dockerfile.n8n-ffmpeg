FROM alpine:3.24 AS ffmpeg-builder

RUN apk add --no-cache ffmpeg \
    && mkdir -p /ffmpeg-root/usr/bin \
    && cp /usr/bin/ffmpeg /usr/bin/ffprobe /ffmpeg-root/usr/bin/ \
    && for bin in /usr/bin/ffmpeg /usr/bin/ffprobe; do \
         ldd "$bin" | awk '/=>/ {print $3} !/=>/ && $1 ~ /^\// {print $1}' | while read lib; do \
           if [ -f "$lib" ]; then \
             mkdir -p "/ffmpeg-root$(dirname "$lib")"; \
             cp -L "$lib" "/ffmpeg-root$lib"; \
           fi; \
         done; \
       done

FROM n8n-base-local:2.40.5

USER root
COPY --from=ffmpeg-builder /ffmpeg-root/ /
USER node
