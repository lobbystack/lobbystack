# Run the SIP server on Azure

This Terraform configuration creates a VM on Azure that runs the SIP server in `docker/asterisk`. The server takes a carrier's calls, such as Zadarma's, and passes them to OpenAI. [Answer calls on a number from another carrier](../docs/voice/external-numbers.md) explains what the server does.

## What it creates

- A resource group, a virtual network and a subnet.
- A static public IP address, Standard SKU. The carrier routes each number to it, so it must not change when the VM restarts.
- A network security group. It allows SIP and audio from the carrier's addresses only, audio from OpenAI's addresses, and SSH from the addresses you list. Everything else inbound is denied.
- An Ubuntu 24.04 VM with SSH key login only. On its first boot it installs Docker, writes the server's files from `docker/asterisk`, and starts it.

## Before you start

You need an Azure subscription, the Azure CLI signed in with `az login`, Terraform 1.6 or newer, an SSH key, and your OpenAI project id (`proj_...`).

## Pick a region and a size

Azure refuses some regions for some subscriptions. It answers `RequestDisallowedByAzure: The selected region is currently not accepting new customers`, and `westeurope` and `germanywestcentral` did that for the first subscription this was tried on. The default is `polandcentral`, which is close to Serbia.

A size also needs vCPU quota for its family in the region. A new subscription often has none for some families, and Azure answers `OperationNotAllowed ... exceeding approved ... Cores quota, Current Limit: 0`. That happened with the burstable `Standard_B2ls_v2`. The default is `Standard_D2als_v6` (2 vCPUs, 4 GB), which had quota on that subscription.

To check before you apply:

```sh
# Quota per family: use a size whose family shows a limit of 2 or more.
az vm list-usage --location polandcentral --query "[?to_number(limit)>\`0\`].{family:name.value, used:currentValue, limit:limit}" -o table

# Sizes the region offers you: restricted must be 0.
az vm list-skus --location polandcentral --resource-type virtualMachines \
  --query "[?starts_with(name,'Standard_D2')].{name:name, family:family, restricted:length(restrictions)}" -o table
```

Pick a size whose family has quota in the first list and `restricted` at 0 in the second, and set `location` and `vm_size` in `terraform.tfvars`. To keep a cheaper size, ask Azure for more quota in the portal under **Quotas**, which can take time. Changing the region replaces the resource group, which is safe while it holds nothing.

## Create the server

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`: your SSH public key, the address you SSH from, and the OpenAI project id. Leave `carrier_ips` empty for now if you don't have Zadarma's addresses. The server then starts closed to every carrier. Then run:

```sh
terraform init
terraform plan
terraform apply
```

The VM takes a few minutes to install Docker and build the server after Terraform finishes. To watch it, run the `ssh_command` output, then `cloud-init status --wait` and `docker compose -f /opt/lobbystack-sip/docker-compose.yml logs asterisk`.

## Connect it

1. Put the `zadarma_sip_host` output in `.env` as `ZADARMA_SIP_HOST` on the worker.
2. In Zadarma, set a number's destination to the `zadarma_destination_example` output, with that number's digits in place of the example's.
3. Set `carrier_ips` in `terraform.tfvars` to the addresses Zadarma's calls come from, and apply again. That opens the firewall for them and tells the server to accept them.

## Change settings

The network rules update in place. The server's own settings, such as `carrier_ips`, `openai_project_id` and the files from `docker/asterisk`, are written once, on first boot, so changing them replaces the VM. The static IP address stays, and calls stop for the few minutes it takes to start again. For a quick change without a replacement, edit `/opt/lobbystack-sip/asterisk.env` on the VM and run `docker compose up -d` there, then put the same value in `terraform.tfvars`, so the next replacement keeps it.

## Keep the state private

The state holds the OpenAI project id, which lets anyone who has it dial in. Don't commit it. For anything beyond a trial, keep it in an encrypted remote backend, such as a private Azure storage account:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "your-state-rg"
    storage_account_name = "yourstateaccount"
    container_name       = "tfstate"
    key                  = "lobbystack-sip.tfstate"
  }
}
```

`terraform.tfvars` and the state files are in `.gitignore`. `.terraform.lock.hcl` isn't, so commit it.

## Not included

- TLS from the carrier. The server supports it, but it needs a certificate for the VM's name, which this configuration doesn't create. Open TCP 5061 yourself if you add one.
- Monitoring, backups and alerts.
- A confirmed full apply. The configuration is validated, and the first-boot script is checked to write the repository's files exactly. The first apply stopped on a region the subscription couldn't use, which is why the region and size checks above exist. Check the result of your own apply.

## Remove it

`terraform destroy` removes everything, including the static address. Numbers routed to that address stop working until you route them somewhere else.
