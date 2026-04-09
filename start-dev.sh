#!/bin/bash
cd "$(dirname "$0")"
VRS_DEV_HTTP=1 VRS_DEV_HOST=localhost make dev
