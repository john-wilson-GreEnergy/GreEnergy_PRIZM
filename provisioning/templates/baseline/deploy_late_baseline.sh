#!/bin/bash

sshpass -p moxa scp -oStrictHostKeyChecking=no deploy-redux.tar moxa@$1:~/
sshpass -p moxa ssh -oStrictHostKeyChecking=no moxa@$1 "tar xf deploy-redux.tar; cd deploy; echo moxa | sudo -S ./featherScript.sh"
