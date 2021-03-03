#!/bin/bash

# To be called bin/release.sh
# SET THE FOLLOWING VARIABLES
# docker hub username
USERNAME=pueteam
# image name
IMAGE=oracle-pdb-operator
PROJECT_ID=oraclepdo
# ensure we're up to date
git pull
# bump version
docker run --rm -v "$PWD":/app $USERNAME/$IMAGE patch
version=$(cat VERSION)
echo "version: $version"
# run build
./scripts/build.sh
# tag it
#git add -A
#git commit -m "version $version"
#git tag -a "$version" -m "version $version"
#git push
#git push --tags
docker tag $USERNAME/$IMAGE:latest $USERNAME/$IMAGE:$version
# push it
docker rmi harbor.pue.es/${PROJECT_ID}/$USERNAME/$IMAGE:latest
docker tag $USERNAME/$IMAGE harbor.pue.es/${PROJECT_ID}/$USERNAME/$IMAGE
docker tag $USERNAME/$IMAGE harbor.pue.es/${PROJECT_ID}/$USERNAME/$IMAGE:$version
docker push harbor.pue.es/${PROJECT_ID}/$USERNAME/$IMAGE:latest
docker push harbor.pue.es/${PROJECT_ID}/$USERNAME/$IMAGE:$version

echo Run this: kubectl set image deployment/$IMAGE $IMAGE=harbor.pue.es/${PROJECT_ID}/$USERNAME/$IMAGE:$version

#docker push $USERNAME/$IMAGE:latest
#docker push $USERNAME/$IMAGE:$version
