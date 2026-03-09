#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "Waiting for service(s) to become healthy..."
TIMEOUT_SECONDS=240
INTERVAL_SECONDS=5
ELAPSED_SECONDS=0

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.ci.yml"

# Get the name(s) of your service(s) from docker-compose.yml
SERVICE_NAMES=$(docker compose $COMPOSE_FILES ps --services)
if [ -z "$SERVICE_NAMES" ]; then
  echo "Error: No services found via 'docker compose ps --services'."
  echo "--- Output of docker compose $COMPOSE_FILES ps --- "
  docker compose $COMPOSE_FILES ps
  echo "--- Output of docker compose $COMPOSE_FILES logs --- "
  docker compose $COMPOSE_FILES logs
  exit 1
fi
echo "Attempting to monitor the following services: [$SERVICE_NAMES]"

while [ $ELAPSED_SECONDS -lt $TIMEOUT_SECONDS ]; do
  ALL_HEALTHY=true
  echo "--- Iteration: ELAPSED_SECONDS=$ELAPSED_SECONDS --- General Docker Compose PS output: --- "
  docker compose $COMPOSE_FILES ps
  echo "--- End of General Docker Compose PS output --- "

  for SERVICE_NAME in $SERVICE_NAMES; do
    echo "Processing service: [$SERVICE_NAME]"
    CONTAINER_ID=$(docker compose $COMPOSE_FILES ps -q $SERVICE_NAME)
    
    if [ -z "$CONTAINER_ID" ]; then
      echo "Warning: Container ID for service '$SERVICE_NAME' not found yet via 'ps -q'."
      echo "--- docker compose $COMPOSE_FILES ps -a output: ---"
      docker compose $COMPOSE_FILES ps -a # Show all containers, even stopped
      echo "--- End of docker compose ps -a output ---"
      echo "--- Last 50 lines of logs for '$SERVICE_NAME' (if available): ---"
      docker compose $COMPOSE_FILES logs --tail="50" $SERVICE_NAME || echo "Logs for '$SERVICE_NAME' might not be available yet."
      echo "--- End of logs for '$SERVICE_NAME' ---"
      ALL_HEALTHY=false
      echo "Retrying in $INTERVAL_SECONDS seconds..."
      break # Break inner loop, re-check all services after interval
    fi

    # Check if the container has a healthcheck defined
    HEALTH_CHECK_DEFINED=$(docker inspect --format='{{if .State.Health}}true{{else}}false{{end}}' $CONTAINER_ID)
    if [ "$HEALTH_CHECK_DEFINED" != "true" ]; then
      echo "Error: Service '$SERVICE_NAME' (Container: $CONTAINER_ID) does NOT have a healthcheck defined. Failing immediately."
      echo "--- Application Logs from Docker Compose for $SERVICE_NAME ---"
      docker compose $COMPOSE_FILES logs $SERVICE_NAME
      exit 1
    fi

    # Container has healthcheck - check its status
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_ID)
    if [ "$HEALTH_STATUS" = "healthy" ]; then
      echo "Service '$SERVICE_NAME' (Container: $CONTAINER_ID) is healthy."
    elif [ "$HEALTH_STATUS" = "unhealthy" ]; then
      echo "Error: Service '$SERVICE_NAME' (Container: $CONTAINER_ID) reported as unhealthy."
      echo "--- Healthcheck Log from Docker Inspect for $SERVICE_NAME (Container: $CONTAINER_ID) ---"
      docker inspect $CONTAINER_ID --format='{{json .State.Health.Log}}' | tail -n 10
      echo "--- Application Logs from Docker Compose for $SERVICE_NAME ---"
      docker compose $COMPOSE_FILES logs $SERVICE_NAME
      exit 1 # Exit script immediately on unhealthy service
    else
      echo "Service '$SERVICE_NAME' (Container: $CONTAINER_ID) status: $HEALTH_STATUS. Waiting..."
      ALL_HEALTHY=false
    fi
  done

  if $ALL_HEALTHY; then
    echo "All monitored services are healthy."
    docker compose $COMPOSE_FILES ps
    exit 0 # All services are healthy, success!
  fi

  sleep $INTERVAL_SECONDS
  ELAPSED_SECONDS=$((ELAPSED_SECONDS + INTERVAL_SECONDS))
done

echo "Error: Timeout reached ($TIMEOUT_SECONDS seconds). Not all services became healthy or discoverable."
echo "--- Final Status of Services --- "
for SERVICE_NAME in $SERVICE_NAMES; do
  CONTAINER_ID=$(docker compose $COMPOSE_FILES ps -q $SERVICE_NAME)
  if [ ! -z "$CONTAINER_ID" ]; then
      HEALTH_CHECK_DEFINED=$(docker inspect --format='{{if .State.Health}}true{{else}}false{{end}}' $CONTAINER_ID)
      if [ "$HEALTH_CHECK_DEFINED" = "true" ]; then
        HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_ID)
        echo "Service '$SERVICE_NAME' (Container: $CONTAINER_ID) health status: $HEALTH_STATUS"
        if [ "$HEALTH_STATUS" = "unhealthy" ] || [ "$HEALTH_STATUS" = "starting" ]; then
            echo "--- Healthcheck Log for $SERVICE_NAME (Container: $CONTAINER_ID) ---"
            docker inspect $CONTAINER_ID --format='{{json .State.Health.Log}}' | tail -n 10
            echo "--- App Logs for $SERVICE_NAME ---"
            docker compose $COMPOSE_FILES logs $SERVICE_NAME
        fi
      else
        echo "Error: Service '$SERVICE_NAME' (Container: $CONTAINER_ID) does NOT have a healthcheck defined."
        echo "--- App Logs for $SERVICE_NAME ---"
        docker compose $COMPOSE_FILES logs $SERVICE_NAME
      fi    
  else
      echo "Service '$SERVICE_NAME' container not found in final status check."
      echo "--- Attempting to get logs for '$SERVICE_NAME' (if it ever existed) ---"
      docker compose $COMPOSE_FILES logs --tail="500" $SERVICE_NAME || echo "Logs for '$SERVICE_NAME' not available."
  fi
done
docker compose $COMPOSE_FILES ps -a
exit 1 