FROM alpine:3.20
RUN apk add --no-cache squid socat tini
COPY squid.conf /etc/squid/squid.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000 3128
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
