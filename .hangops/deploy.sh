#!/bin/bash

gcloud builds submit --project=hangops-jobbot --config .hangops/gke-build-config.yaml