#!/bin/bash

echo "🚀 GitHub Repository Creation Assistant"
echo "======================================"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "📥 Install it with: brew install gh"
    echo "🔗 Or visit: https://cli.github.com/"
    echo ""
    echo "🔄 Alternative: Manual setup"
    echo "1. Go to https://github.com/new"
    echo "2. Repository name: aws-lambda-otel-observability"
    echo "3. Description: AWS Lambda OpenTelemetry observability demo with distributed tracing"
    echo "4. Make it Public"
    echo "5. Don't initialize with README"
    echo "6. Click 'Create repository'"
    echo ""
    echo "Then run: ./push-to-github.sh"
    exit 1
fi

# Check if user is logged in to GitHub CLI
if ! gh auth status &> /dev/null; then
    echo "🔐 Please login to GitHub CLI first:"
    echo "gh auth login"
    exit 1
fi

# Get GitHub username
GITHUB_USER=$(gh api user --jq .login)
echo "👤 GitHub user: $GITHUB_USER"

# Repository details
REPO_NAME="aws-lambda-otel-observability"
REPO_DESC="AWS Lambda OpenTelemetry observability demo with distributed tracing"

echo ""
echo "📝 Creating repository: $REPO_NAME"
echo "📄 Description: $REPO_DESC"
echo ""

# Create the repository
gh repo create "$REPO_NAME" \
    --description "$REPO_DESC" \
    --public \
    --clone=false \
    --add-readme=false

if [ $? -eq 0 ]; then
    echo "✅ Repository created successfully!"
    echo "🔗 URL: https://github.com/$GITHUB_USER/$REPO_NAME"
    
    # Add remote and push
    echo ""
    echo "📤 Adding remote and pushing code..."
    git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"
    git push -u origin main
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "🎉 SUCCESS! Your OTEL demo is now on GitHub!"
        echo "🔗 Repository: https://github.com/$GITHUB_USER/$REPO_NAME"
        echo ""
        echo "📋 Next steps:"
        echo "1. Visit your repository to see the code"
        echo "2. Add topics: aws-lambda, opentelemetry, distributed-tracing"
        echo "3. Star your own repo! ⭐"
    else
        echo "❌ Failed to push code to GitHub"
        echo "🔄 Try running: git push -u origin main"
    fi
else
    echo "❌ Failed to create repository"
    echo "💡 You might need to:"
    echo "1. Check your GitHub CLI authentication: gh auth status"
    echo "2. Ensure the repository name doesn't already exist"
fi