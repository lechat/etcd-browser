#!/bin/bash

if [ -n "$COLOR" ]
then
    sed -i "s|>etcd browser| style=\"background-color:${COLOR}\">etcd browser|" /opt/etcd-browser/index.html
fi
if [ -n "$TITLE" ]
then
    sed -i "s|etcd browser|${TITLE}|" /opt/etcd-browser/index.html
fi
if [ -n "$ETCD_HOST" ]
then
    sed -i "s|http://172.17.42.1:4001/|${ETCD_HOST}|" /etc/nginx/sites-available/default
fi
if [ -n "$CONFED_HOST" ]
then
    sed -i "s|url: null,//confed-url|url: '${CONFED_HOST}',|" /opt/etcd-browser/etcdbrowser.js
fi
if [ -f /data/cert.pem ]
then
    cp /etc/nginx/default-ssl /etc/nginx/sites-available/default-ssl
    sed -i "s|http://172.17.42.1:4001/|${ETCD_HOST}|" /etc/nginx/sites-available/default-ssl
    ln -s /etc/nginx/sites-available/default-ssl /etc/nginx/sites-enabled/default-ssl
fi

exec /usr/sbin/nginx -g "daemon off;"
