#!/bin/bash

# Navigate to the repository directory
cd C:/Development/atom-secured-lending || exit

# Check the status of the repository
echo "Checking Git status..."
git status

# Add all changes
echo "Adding changes..."
git add .

# Commit changes with a message
echo "Committing changes..."
git commit -m "secured-lending Commit"

# Push changes to the remote repository
echo "Pushing changes to remote..."
git push

echo "Git operations completed!"