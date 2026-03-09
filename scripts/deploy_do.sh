#!/bin/bash

APP_ID="a5c99193-7e58-43a5-a9d5-3f1d23a57648"
DEFAULT_SPEC_FILE=".do/testnet_spec.yaml"

echo "Updating DigitalOcean App: $APP_ID with spec: $DEFAULT_SPEC_FILE from GitHub (main branch)"
if ! doctl apps update "$APP_ID" --spec "$DEFAULT_SPEC_FILE" --update-sources --wait; then
  echo "Error: 'doctl apps update' failed."
  exit 1
fi
echo "GitHub deployment command finished successfully."