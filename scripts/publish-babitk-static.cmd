@echo off
az storage account create -g babitk-rg -n babitkwebstatic --sku Standard_LRS --kind StorageV2 --location swedencentral --allow-blob-public-access true -o none
if errorlevel 1 exit /b 1
az storage blob service-properties update --account-name babitkwebstatic --static-website --index-document index.html --404-document index.html -o none
if errorlevel 1 exit /b 1
az storage blob upload-batch -s "c:\Users\USER\MindTasker\web\dist" -d "$web" --account-name babitkwebstatic --overwrite true -o none
if errorlevel 1 exit /b 1
az storage account show -g babitk-rg -n babitkwebstatic --query "primaryEndpoints.web" -o tsv
echo DONE
