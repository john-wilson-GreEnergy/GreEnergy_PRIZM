#!/bin/bash
# PRIZM Provisioning Template
# Reference / preview asset for controlled provisioning planning.
# Do not store credentials in this file.
# Do not run manually unless reviewed and approved for the target site.


WAR_FILE=${1:-null}
XML_FILE=${2:-null}
IO_LOGIC_IP=${3:-null}
INSTALL_DIR=${4:-'/var/lib/tomcat8/webapps/'}
CONF_DIR=${5:-'/var/lib/tomcat8/conf/Catalina/localhost/'}

function installWar {
  if [[ $WAR_FILE =~ "null" ]] || [[ $XML_FILE =~ "null" ]] ;
  then
    echo "=========================================="
    echo "[USAGE]: ./hatchery_install_war.sh -WAR_FILE -XML_FILE -INSTALL_DIR(optional) -TOMCAT_CONFIGURATION_DIR(optional)"
    echo "[INPUT]: ./hatchery_install_war.sh  \"$WAR_FILE\" \"$XML_FILE\" \"$INSTALL_DIR\" \"$CONF_DIR\""
    echo "=========================================="
    exit 10
  fi

  WAR_NAME=$(basename $WAR_FILE | sed 's/.war//')
  WAR_BASE=$(basename $WAR_FILE)
  XML_NAME=$(basename $XML_FILE)
  
  PRIZM_SUDO_PASSWORD="${PRIZM_SUDO_PASSWORD:-}"
  if [[ -z "$PRIZM_SUDO_PASSWORD" ]]; then
    echo "Error: PRIZM_SUDO_PASSWORD must be set."
    exit 1
  fi
  SUDOPASS="$PRIZM_SUDO_PASSWORD"

  echo "$SUDOPASS" | sudo -S service tomcat8 stop

  if ( echo $WAR_FILE | grep -q "feather" ) ;
  then
    echo "$SUDOPASS" | sudo -S sed -i "s/{io_logik_ip}/$IO_LOGIC_IP/g" $XML_FILE
  fi

  echo "$SUDOPASS" | sudo -S rm -rf $INSTALL_DIR$WAR_BASE $INSTALL_DIR$WAR_NAME $CONF_DIR$XML_NAME
  echo "$SUDOPASS" | sudo -S cp $WAR_FILE $INSTALL_DIR
  echo "$SUDOPASS" | sudo -S mkdir -p /var/lib/tomcat8/conf/Catalina/localhost
  echo "$SUDOPASS" | sudo -S chmod -R 777 /var/lib/tomcat8/conf
  echo "$SUDOPASS" | sudo -S cp $XML_FILE $CONF_DIR

  echo "$SUDOPASS" | sudo -S service tomcat8 start
}

installWar
