#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Scanning for potential secrets in codebase...${NC}"

# Create directory to store results
SCAN_DIR="secret-scan-results"
mkdir -p $SCAN_DIR

# File patterns that might contain secrets
echo -e "${YELLOW}Looking for sensitive file patterns...${NC}"
find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/build/*" -not -path "*/.next/*" | grep -E "\.(pem|key|p12|pfx|cert|crt|cer|der|secret)$|id_(rsa|dsa|ed25519)" > $SCAN_DIR/sensitive-files.txt

# Look for potential API keys, tokens, passwords in code
echo -e "${YELLOW}Looking for potential API keys, tokens, passwords...${NC}"
grep -r --include="*.{js,jsx,ts,tsx,json,html,css}" --exclude-dir={node_modules,.git,build,.next} -E "(api[_-]?key|apikey|secret|password|credential|token|auth)[=\"'\s:=]{1,3}['\"0-9a-zA-Z]+" . > $SCAN_DIR/potential-hardcoded-secrets.txt

# Look for .env files that might have been committed
echo -e "${YELLOW}Checking for .env files...${NC}"
find . -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*" > $SCAN_DIR/env-files.txt

# Check Git history for sensitive files that were previously committed
echo -e "${YELLOW}Checking Git history for sensitive files...${NC}"
git log --all --name-only --pretty=format: | grep -E "\.(pem|key|p12|pfx|cert|crt|cer|der|secret)$|id_(rsa|dsa|ed25519)|\.env" | sort | uniq > $SCAN_DIR/sensitive-files-in-history.txt

# Count issues
SENSITIVE_FILES=$(cat $SCAN_DIR/sensitive-files.txt | wc -l | tr -d ' ')
HARDCODED_SECRETS=$(cat $SCAN_DIR/potential-hardcoded-secrets.txt | wc -l | tr -d ' ')
ENV_FILES=$(cat $SCAN_DIR/env-files.txt | wc -l | tr -d ' ')
HISTORY_ISSUES=$(cat $SCAN_DIR/sensitive-files-in-history.txt | wc -l | tr -d ' ')

TOTAL=$((SENSITIVE_FILES + HARDCODED_SECRETS + ENV_FILES + HISTORY_ISSUES))

# Print summary
echo -e "\n${YELLOW}====== SECRET SCAN SUMMARY ======${NC}"
echo -e "Sensitive files found: ${RED}$SENSITIVE_FILES${NC}"
echo -e "Potential hardcoded secrets: ${RED}$HARDCODED_SECRETS${NC}"
echo -e "Environment files: ${RED}$ENV_FILES${NC}"
echo -e "Sensitive files in Git history: ${RED}$HISTORY_ISSUES${NC}"
echo -e "--------------------------------"
echo -e "Total issues: ${RED}$TOTAL${NC}"
echo -e "\nDetailed results saved in the '$SCAN_DIR' directory"

if [ $TOTAL -gt 0 ]; then
  echo -e "\n${RED}WARNING: Potential secrets found in the codebase!${NC}"
  echo -e "Please review the results in the '$SCAN_DIR' directory and fix any issues."
  exit 1
else
  echo -e "\n${GREEN}No potential secrets found in the codebase.${NC}"
  exit 0
fi 