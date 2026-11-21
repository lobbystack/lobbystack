terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # Local state holds the OpenAI project id, which lets anyone who has it dial in. Keep real state in an
  # encrypted remote backend, such as an azurerm backend on a private storage account. See README.md.
}

provider "azurerm" {
  features {}

  # Leave empty to use the subscription `az login` selected, or the ARM_SUBSCRIPTION_ID environment variable.
  subscription_id = var.subscription_id
}
