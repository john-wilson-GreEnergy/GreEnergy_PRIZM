#!/bin/bash

FILE_DIR=${1:-'./'}
CRON_SCRIPT_DIR=${2:-'./cronScripts/'}

#Check if input directories end in "/" for directories
if !( echo $FILE_DIR | grep -qE "/$" ); then
  FILE_DIR=$FILE_DIR"/"
fi
if !( echo $CRON_SCRIPT_DIR | grep -qE "/$" ); then
  CRON_SCRIPT_DIR=$CRON_SCRIPT_DIR"/"
fi

cd hatchery
sudo chmod 777 *

if [[ ! -d $FILE_DIR ]]  || [[ ! -d $CRON_SCRIPT_DIR ]] ; then
  echo "=========================================="
  echo "[USAGE]: ./hatchery_configure_feather_powin.sh -FILE_DIR(optional) -CRON_SCRIPT_DIR(optional)"
  echo "[INPUT]: ./hatchery_configure_feather_powin.sh \"$FILE_DIR\" \"$CRON_SCRIPT_DIR\""
  echo "=========================================="
  exit 10
fi

CONFIG_JSON=$FILE_DIR'configuration.json'
PHYSICALCONFIG_JSON=$FILE_DIR'physicalconfiguration.json'
FOURBAIDENTITY=$FILE_DIR'fourbaidentity.json'
SUNSPECAPI_CONFIG=$FILE_DIR'sunspecAPIConfig.json'
NETMAP_ENTITY=$FILE_DIR'netmap_entity.csv'
NETMAP_STRING=$FILE_DIR'netmap_string.csv'
NETMAP_OTHER=$FILE_DIR'netmap_other.csv'

#make the powin folders
sudo mkdir -p /etc/powin
sudo mkdir -p /etc/powin/fw/feather/deploy/
sudo mkdir -p /etc/powin/scripts
sudo mkdir -p /etc/powin/signals
sudo mkdir -p /etc/powin/configurationPackage

#Copy the configuration/netmap files to their new home
sudo cp $CONFIG_JSON /etc/powin/
sudo cp $PHYSICALCONFIG_JSON /etc/powin/
sudo cp $FOURBAIDENTITY /etc/powin/
sudo cp $SUNSPECAPI_CONFIG /etc/powin/
sudo cp $NETMAP_ENTITY /etc/powin/
sudo cp $NETMAP_STRING /etc/powin/
sudo cp $NETMAP_OTHER /etc/powin/

#Change the owner of the folder to tomcat8
sudo chown -R tomcat8:tomcat8 /etc/powin

#Change the permissions of the contents of the folder
sudo chmod -R u+rw /etc/powin/
sudo chmod -R a+r /etc/powin/

#start cron scripts
sudo ./hatchery_start_cron_scripts.sh $CRON_SCRIPT_DIR script_featherUpgradeSystem.sh
#Configure tomcat service
sudo ./hatchery_configure_tomcat_service.sh $FILE_DIR
#Configure RS485
sudo ./hatchery_configure_rs485_service.sh $FILE_DIR
#Set min free kbytes
sudo ./hatchery_set_feather_min_free_kbytes.sh
#Configure NTP
sudo ./hatchery_configure_ntp.sh $FILE_DIR
#updated to handle Debian strech having moved to archive repositoties
sudo ./hatchery_configure_source_list.sh $FILE_DIR
