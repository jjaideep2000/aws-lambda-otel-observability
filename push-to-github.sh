#!/bin/bash

echo "📤 Manual GitHub Push Assistant"
echo "==============================="

echo "🔍 Checking git status..."
git status

echo ""
echo "📝 If you created the repository manually, enter your GitHub username:"
read -p "GitHub username: " GITHUB_USER

if [ -z "$GITHUB_USER" ]; then
    echo "❌ GitHub username is required"
    exit 1
fi

REPO_NAME="aws-lambda-otel-observability"
REPO_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"

echo ""
echo "🔗 Repository URL: $REPO_URL"
echo ""

# Check if remote already exists
if git remote get-url origin &> /dev/null; then
    echo "🔄 Remote 'origin' already exists. Updating..."
    git remote set-url origin "$REPO_URL"
else
    echo "➕ Adding remote 'origin'..."
    git remote add origin "$REPO_URL"
fi

echo "📤 Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 SUCCESS! Your code is now on GitHub!"
    echo "🔗 Visit: https://github.com/$GITHUB_USER/$REPO_NAME"
    echo ""
    echo "📋 Recommended next steps:"
    echo "1. Add repository topics:"
    echo "   - aws-lambda"
    echo "   - opentelemetry" 
    echo "   - distributed-tracing"
    echo "   - observability"
    echo "   - sns-sqs"
    echo "2. Star your repository ⭐"
    echo "3. Share with your team!"
else
    echo ""
    echo "❌ Push failed. Common solutions:"
    echo "1. Make sure the repository exists on GitHub"
    echo "2. Check your GitHub credentials"
    echo "3. Verify the repository URL is correct"
    echo ""
    echo "🔄 Try again with:"
    echo "git push -u origin main"
fi