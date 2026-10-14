FROM public.ecr.aws/amazonlinux/amazonlinux:2023@sha256:12052e9b5d3fd85769abbdd863dd038e1890c9ace31d5fdbe1afa78eda97d061 AS build
RUN dnf -y install gcc make perl bison flex openssl-devel zlib-devel tar bzip2 findutils && dnf clean all
WORKDIR /build
RUN curl --fail --location --proto '=https' --max-time 120 https://ftp.postgresql.org/pub/source/v18.6/postgresql-18.6.tar.bz2 --output postgres.tar.bz2 && echo '555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f  postgres.tar.bz2' | sha256sum --check && tar -xjf postgres.tar.bz2
WORKDIR /build/postgresql-18.6
RUN ./configure --prefix=/opt/client --without-icu --without-readline --with-ssl=openssl && make -j2 && make -C src/interfaces/libpq install && make -C src/bin/pg_dump install
RUN mkdir -p /runtime/bin /runtime/lib /runtime/licenses && cp /opt/client/bin/pg_dump /opt/client/bin/pg_restore /runtime/bin/ && cp /opt/client/lib/libpq.so.5.18 /runtime/lib/ && cp /opt/client/lib/libpq.so.5.18 /runtime/lib/libpq.so.5 && cp /usr/lib64/libssl.so.3 /usr/lib64/libcrypto.so.3 /usr/lib64/libz.so.1 /runtime/lib/ && cp COPYRIGHT /runtime/POSTGRESQL-LICENSE && cp /usr/share/licenses/openssl-libs/LICENSE.txt /runtime/licenses/OPENSSL-LICENSE.txt && cp /usr/share/licenses/zlib/README /runtime/licenses/ZLIB-README
RUN LD_LIBRARY_PATH=/runtime/lib /runtime/bin/pg_dump --version && LD_LIBRARY_PATH=/runtime/lib /runtime/bin/pg_restore --version
FROM scratch AS export
COPY --from=build /runtime/ /
