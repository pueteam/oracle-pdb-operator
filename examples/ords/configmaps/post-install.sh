cd /opt/oracle/ords/config/ords/
java -jar ../../ords.war set-property database.api.enabled true
java -jar ../../ords.war set-properties --conf apex_pu cdbAdmin.properties