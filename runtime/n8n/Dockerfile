FROM alpine:3.24 AS native-tools

RUN apk add --no-cache ffmpeg util-linux \
    && mkdir -p /native-root/usr/bin \
    && for bin in /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/flock; do \
         cp "$bin" /native-root/usr/bin/; \
         ldd "$bin" | awk '/=>/ {print $3} !/=>/ && $1 ~ /^\// {print $1}' | while read lib; do \
           if [ -f "$lib" ]; then \
             mkdir -p "/native-root$(dirname "$lib")"; \
             cp -L "$lib" "/native-root$lib"; \
           fi; \
         done; \
       done

FROM n8nio/n8n:2.40.5

USER root
COPY --from=native-tools /native-root/ /
USER node
