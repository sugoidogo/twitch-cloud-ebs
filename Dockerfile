FROM jacoblincool/workerd:latest

COPY ./worker.capnp ./worker.capnp

VOLUME /worker/cache
VOLUME /worker/kv
VOLUME /worker/d1
VOLUME /worker/r2

EXPOSE 8080/tcp

CMD ["serve", "--experimental", "--binary", "worker.capnp"]