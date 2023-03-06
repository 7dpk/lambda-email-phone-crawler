# AWS-Lambda-web-crawler

![template1-designer (4)](https://user-images.githubusercontent.com/90252765/170829662-e5621e3a-49c2-44a3-953b-337ee6ea7f52.png)

This project contains source code and supporting files for a serverless application that you can deploy with the SAM CLI. It includes the following files and folders.


- **webcrawler** - Code crawling a website
- **emailphoneextractor** - Code for the extracting email/phone
- events - Invocation events that you can use to invoke the function.
- template.yaml - A template that defines the application's AWS resources.

The application uses several AWS resources, including Lambda functions and a Step-Function. These resources are defined in the `template.yaml` file in this project. You can update the template to add AWS resources through the same deployment process that updates your application code.

## Deploy the sample application

The Serverless Application Model Command Line Interface (SAM CLI) is an extension of the AWS CLI that adds functionality for building and testing Lambda applications. It uses Docker to run your functions in an Amazon Linux environment that matches Lambda. It can also emulate your application's build environment and API.

To use the SAM CLI, you need the following tools.

* SAM CLI - [Install the SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
* Node.js - [Install Node.js 14.x](https://nodejs.org/en/), including the NPM package management tool.
* Docker - [Install Docker community edition](https://hub.docker.com/search/?type=edition&offering=community)


> **_NOTE:_** Create a s3 bucket through aws console or cli as below
> ```bash
>   $ aws s3 mb s3://your-unique-bucket-name
> ```
>  and update `template.yaml` where the lambda can store >the crawled pages
>```yaml
>  Parameters: 
>  AppBucketName: 
>    Type: String
>    Default: your-unique-bucket-name # bucket name has to >be globally unique
>```



To build your application for the first time, run the following in your shell:

```bash
$ git clone https://github.com/theerakesh/lambda-web-crawler.git
$ cd lambda-web-crawler/
$ sam build
```

The first command will build the source of your application. The second command will package and deploy your application to AWS, with a series of prompts


## Use the SAM CLI to build and test locally

### **Build**

Build your application with the `sam build` command.

```bash
lambda-web-crawler$ sam build
```

The SAM CLI installs dependencies defined in `hello-world/package.json`, creates a deployment package, and saves it in the `.aws-sam/build` folder.

### **Invoke/Test**
Test a single function by invoking it directly with a test event. An event is a JSON document that represents the input that the function receives from the event source. Test events are included in the `events` folder in this project.

Run functions locally and invoke them with the `sam local invoke` command.

```bash
lambda-web-crawler$ sam local invoke WebCrawlerFunction --event events/event.json
```

### **Deploy**
```bash
lambda-web-crawler$ sam deploy --guided
```
Once deployed you can use the step function to invoke the lambda as follows

- first provide a Input as `event`
  <img width="865" alt="image" src="https://user-images.githubusercontent.com/90252765/170495065-5a040f05-54dd-4025-8d5c-16f5818d9a60.png">

- start execution and u can see following out based on the steps fails or passes
- **fail**
  <img width="673" alt="image" src="https://user-images.githubusercontent.com/90252765/170495467-fca915f9-e55c-4dd2-aebb-8d0f5e2661e2.png">

- **pass**
  <img width="664" alt="image" src="https://user-images.githubusercontent.com/90252765/170495673-139acf8f-e270-48f0-8eed-9365e54ee606.png">

- Now you can select the state and see the respective `input/output` e.g. after selecting state `EmailPhoneExtractor`
  <img width="667" alt="image" src="https://user-images.githubusercontent.com/90252765/170495997-36685031-3aa3-4179-8fc1-9ab15ce31b6c.png">

## Understanding how the lambdas works

### First Lambda/webcrawler 
1. It checks if the the website has already been fetched by checking if there's a folder by that `domain` if it exists it passes control over to second lambda
   ```javascript
    const found = await s3.listObjectsV2({ Bucket: uploadParams.Bucket, Prefix: `${url}/`, MaxKeys: 1 }).promise()
    if (found.Contents.length > 0) {
      return {
        'statusCode': 200,
        'domain': url,
        'body': `domain has already been fetched ${JSON.stringify(found)}`
      }
   ```

2. First lambda `webcrawler` uses `axios` to fetch the website then it leverages `cheerio` to extract all the links in `navbar` 
    ```js
        const links = new Set()
        const data = await axios.get(`https://${url}`).data
        const $ = cheerio.load(data)
          // using cheerio selector
        $('nav a').each((i, e) => {
          links.add($(e).attr('href'))
        })

        ```
3. Now a simple for loop to fetch all the links asynchronously and write the content of them to a s3 bucket as an object with `key` as `domain`
   ```js
    for (let i of links) {
      try {
        let response = await axios.get(i).data
        try {
            s3data = await s3.putObject(uploadParams).promise()
          } catch (e) {
            return {
              'statusCode': 400,
              'body': JSON.stringify(e)
            }
          }
        }
      } catch (e) {
          return {
            'statusCode': 400,
            'body': JSON.stringify(e)
          }
        } 
    }
    ```
  
### Second Lambda/EmailPhoneExtractor

1. First it checks if the website has already been scanned for emails and passwords using `dynamodb` cache
    ```js
    try {
      const dbResult = await db.get({
        TableName: tableName, Key: {
          domain: url
        }
      }).promise()
      if (dbResult) {
        return {
          'statusCode': 200,
          'body': `emails: ${JSON.stringify(dbResult.Item.emails)}, phones: ${JSON.stringify(dbResult.Item.phones)}`
        }
      }
    } catch (e) {
        return {
          'statusCode': 400,
          'body': `Problem with table ${tableName} error: ${JSON.stringify(e)}`
        }
    }
    ```
2. If the record is not found it gets all the objects from S3 Bucket using key `url`
    ```js
      let res = (await s3.listObjectsV2({ Bucket: process.env.S3BucketName, Prefix: `${url}/` }).promise()).Contents
    ```
3. Now it scan each page one by one using regex to find `email/phone`
    ```js
    const objectData = (await s3.getObject({ Bucket: process.env.S3BucketName, Key: r.Key }).promise()).Body.toString('utf-8')
    let email_matches = objectData.match(emailRegex)
    let phone_matches = objectData.match(phoneRegex)
    ```
4. Regex used for email
   ```js
   const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/g
   ```
5. Regex used for phone numbers
   ```js
   const phoneRegex = /(?<!\d)(\+ ?\d{1,2}[\s\u00A0]?)\(?\d{3}\)?[\s.-\u00A0]?\d{3}[\s.-\u00A0]?\d{4}(?!\d)/g
   // I had to use negative look-behind (?<!\d) and negative lookahead (?!\d) to stop matching any random 10 digit occurences
   ```
6. Results found then are written to dynamodb table for faster access and then it returns the results

## Todo
- [x] Add dynamodb caching
- [ ] Add `unit testing`
- [ ] Using `AWS SQS` to do a recursive web-crawling
- [ ] Automate deletion of data in `AWS S3` after a day or a specific period since web content may get stale
- [ ] Implement CI/CD in `github actions`
- [ ] Add Typescript support
