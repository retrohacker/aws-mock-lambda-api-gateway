.SILENT:
help:
	echo
	echo "AWS Mock Lambda API Gateway commands"
	echo
	echo "  Commands: "
	echo
	echo "    build       - Build the docker images that power local dev"
	echo "    build-fresh - Build the docker images without using cache"
	echo "    test        - Run the local tests whenever a change happens on the local fs"
	echo "    deps        - Check for all dependencies of this project"
	echo

build:
	docker build -t test/aws-mock-lambda-api-gateway .

build-fresh:
	docker build --no-cache -t test/aws-mock-lambda-api-gateway .

# Rebuild before running tests incase Dockerfiles have changed
test: clean build
	docker run -it -v ${PWD}:/usr/src/test -w /usr/src/test test/aws-mock-lambda-api-gateway /bin/bash -c "ln -s /usr/src/app/node_modules /usr/src/test && nodemon --legacy-watch --ignore ./node_modules --exec npm test"

clean:
	sudo rm -rf ./node_modules ./coverage
	rm -f package.zip

deps:
	echo "  Dependencies: "
	echo
	echo "    * docker $(shell which docker > /dev/null || echo '- \033[31mNOT INSTALLED\033[37m')"
	echo "    * docker-compose $(shell which docker-compose > /dev/null || echo '- \033[31mNOT INSTALLED\033[37m')"
	echo
