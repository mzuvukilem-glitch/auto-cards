# CQA TestAuto Master Repo

## Table of Contents
- Checkout Specific Directory from a Git Repository
- Moving to CQA TestAuto Master repo  
- Referencing Tests from other modules

## Checkout Specific Directory from a Git Repository

Follow these steps to checkout only a specific directory from a Git repository.

### Step 1: Initialize a New Git Repository
In a new folder, initialize a Git repository:
```bash
git init
```

### Step 2: Add Remote Repository
Add the remote repository and fetch its contents:
```bash
git remote add -f origin https://gts-it.fnb.co.za/stash/scm/testauto/cqa_testauto_master.git
```

### Step 3: Enable Sparse Checkout
Enable sparse checkout in your Git configuration:
```bash
git config core.sparseCheckout true
```

### Step 4: Specify Directory to Checkout
If you don't want any specific projects and want only the main module for an initial pull:
```bash
echo /pom.xml >> .git/info/sparse-checkout
```
If you want to specify an existing directory that you want to checkout, add its path to the sparse-checkout file:
```bash
echo /pom.xml >> .git/info/sparse-checkout
echo payment-test-automation >> .git/info/sparse-checkout
```
To update your local repository after making changes to the sparse-checkout file:
```
git read-tree -mu HEAD
```

Alternatively, you can manually edit the .git/info/sparse-checkout file in a text editor to include the path(s) you want to pull. List each directory on a new line, not separated by commas.

### Step 5: Pull the Specified Directory
Pull the specified directory from the remote repository:
```bash
git pull origin master
```
Now you should have only the specified directory checked out in your local repository.

## Moving to CQA TestAuto Master repo 

### Step 1: Clone the main repository using git sparse checkout to include only the necessary files
See above "Checkout Specific Directory from a Git Repository" steps.

### Step 2: Create a Module in IntelliJ
Open IntelliJ IDEA and create a new module under the parent module cqa_testauto_master:
- Right-click on the parent module cqa_testauto_master and select New -> Module...
- Ensure the parent tag references the cqa_testauto_master POM file.
- Set the groupId, artifactId, and version correctly for the new child module.

### Step 3: Clean the Original Project’s POM File
Clean the POM file of the original project:
- Remove dependencies that are already included in the parent POM file (**testauto-int-test-framework, testauto-ui-automation-base, terminal-automation-3270, testauto-web-ui-automation-base**).
- Clean up any comments and hardcoded versions

### Step 4: Copy POM Contents and Source Code
Copy the cleaned-up POM contents from the original repository to the newly created child module.

### Step 5: Copy the src folder from the old project to the newly created child module

### Step 6: Run Clean Install
Run a clean install to ensure everything compiles successfully:
```bash
mvn clean install -DskipTests
```

### Step 7: Run any Tests to Confirm Successful Compilation

## Referencing Tests from other modules

Follow these steps to reference a test from another module.

### Step 0: Have the module you need to reference in your project  
Follow **Step 4** under "Checkout Specific Directory from a Git Repository" to get a specific project module to your local
_Remember to update local repository after making changes to the sparse-checkout file with the command:_
```bash
git read-tree -mu HEAD
```

### Step 1: Build the project module you want to include in the source module
```bash
mvn package
```

### Step 2: Include the test-jar dependency to the pom file
In the pom.xml file of the module where you want to call the external test in add the following dependency inside the dependencies tag:

_Example if you want to add deposits tests to the payments module, then you need to add the deposits test-jar dependency to the payments pom.xml:_
```bash
<dependencies>
  ...
    <dependency>
        <groupId>gts.testauto</groupId>
        <artifactId>deposits</artifactId>
        <version>1.0-SNAPSHOT</version>
        <type>test-jar</type>
        <scope>test</scope>
    </dependency>
  ...
</dependencies>

```






