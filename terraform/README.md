# Run the SIP server on Azure

This Terraform configuration creates a VM on Azure that runs the SIP server in `docker/asterisk`. The server takes a carrier's calls, such as Zadarma's, and passes them to OpenAI. [Answer calls on a number from another carrier](../docs/voice/external-numbers.md) explains what the server does.

## What it creates

- A resource group, a virtual network and a subnet.
- A static public IP address, Standard SKU. The carrier routes each number to it, so it must not change when the VM restarts.
- A network security group. It allows SIP and audio from the carrier's addresses only, audio from OpenAI's addresses, and SSH from the addresses you list. Everything else inbound is denied.
- An Ubuntu 24.04 VM with SSH key login only. On its first boot it installs Docker, writes the server's files from `docker/asterisk`, and starts it.
- With `deploy_app` on, a second VM for the web app, with its own static address and firewall, in the same group. [Run the web app](#run-the-web-app) explains it.

## Layout

```
main.tf            wires the modules together
locals.tf          the values they share: tags, the firewall rules, the first-boot files
templates/         the files Terraform fills in (*.tftpl), such as the VM's cloud-init
data.tf            data sources (none yet)
variables.tf       every setting, with its description
providers.tf       the azurerm provider
outputs.tf         the address, the SSH command and the Zadarma values
environments/      dev.tfvars, sandbox.tfvars, prod.tfvars: the settings that differ per environment
scripts/python/    deploy.py (a menu that runs Terraform), start.py and stop.py (the VM), and resources/components/ with their code
modules/<name>/    one module per Azure resource type, each with main.tf, locals.tf, variables.tf and outputs.tf
```

A module creates only the resource type it is named for, without the `azurerm_` part: `resource_group`, `virtual_network`, `subnet`, `public_ip`, `network_security_group`, `network_security_rule`, `network_interface`, `network_interface_security_group_association` and `linux_virtual_machine`. To add another resource type, add a module for it and call it from `main.tf`.

## Environments

`environments/<environment>.tfvars` holds what isn't secret: the environment, the Azure subscription, the application's name, the region, the VM size and the carrier's addresses. `terraform.tfvars` (gitignored) holds what is: your SSH key, the addresses that may reach SSH and the OpenAI project id. Terraform reads `terraform.tfvars` by itself, and you add the environment's file:

```sh
terraform plan -var-file=environments/dev.tfvars
```

Each environment keeps its own state in its own workspace, so applying one never plans to remove another's resources:

```sh
terraform workspace new sandbox      # the first time
terraform workspace select sandbox
terraform apply -var-file=environments/sandbox.tfvars
```

`dev` was created before workspaces, so its state stays in the `default` workspace, and Terraform accepts that for `dev` only. Selecting the wrong workspace shows a warning, so read the plan before you apply. Each environment also gets its own resource group, named from `app_name`, `resource-group` and the environment, such as `lobbystack-sip-resource-group-dev`. Destroying one environment can't touch another's resources. The resources inside are named from `app_name`, their resource type and the environment, such as `lobbystack-sip-linux-virtual-machine-dev`. See AGENTS.md.

An existing environment can't be renamed in place, because Azure can't rename a resource group. Moving an environment from an older name to this one replaces every resource in it, including the public IP, so the address changes and the numbers routed to it need pointing at the new one.

## Deploy with the menu

`scripts/python/deploy.py` runs the same Terraform commands from a menu, so you pick an environment instead of typing the workspace and variable file each time. It needs Python 3.10 or newer and the Azure CLI signed in.

```sh
python3 scripts/python/deploy.py
```

| Option | What it does |
| --- | --- |
| Plan | Previews the changes. |
| Apply | Saves a plan, shows it, and applies that exact plan only after you confirm. It prints the outputs afterwards. |
| Drift | Compares the state with what Azure has now, and lists the resources someone changed by hand. |
| Destroy | Removes the environment. You type its name to confirm. |
| Import | Adopts existing resources listed in `scripts/python/resources/import/<environment>.json`. Copy `scripts/python/resources/import/environment.template.json` for the format. |
| Init | Runs `terraform init` and selects the environment's workspace. |

It shows the Azure subscription the environment uses and asks nothing about it. Saved plans hold the same secrets as the state, so `*.tfplan` is gitignored and the tool deletes its plan files when it finishes.

## Start and stop the VM

`stop.py` deallocates the VM, which ends its compute bill and keeps the disk and the static IP, so the address is the same when `start.py` brings it back. Calls to the number fail while it is stopped. Both take an environment, which is `dev` when you leave it out:

```sh
python3 scripts/python/stop.py            # dev
python3 scripts/python/start.py sandbox
python3 scripts/python/stop.py prod       # asks first; --yes skips the question
```

They use the environment's subscription and resource group from its tfvars file. `$RESOURCE_GROUP` names a group directly instead.

An environment with the web app has two VMs. Both scripts act on the SIP server unless `--target` says otherwise: `--target app` for the web app, `--target all` for both. Each VM's `purpose` tag tells them apart.

```sh
python3 scripts/python/stop.py dev --target app   # takes the site down, and leaves the SIP server answering
```

## Subscriptions

`dev` and `sandbox` use the NPD subscription, and `prod` uses the PRD one. Each environment file sets `subscription_id`, and Terraform builds everything there, whichever subscription `az` has selected. `deploy.py` shows that subscription, and `start.py` and `stop.py` read it from the same file.

`prod.tfvars` holds a placeholder until you put the PRD subscription's id in it. While it is there, every Terraform command for prod stops on the `subscription_id` check, so prod can't be created in the NPD subscription by mistake. List the ids you can use with:

```sh
az account list --query "[].[name,id]" -o tsv
```

The account you sign in with needs access to the subscription. If PRD is in another tenant, sign in with `az login --tenant <tenant id>` first.

## Before you start

You need an Azure subscription, the Azure CLI signed in with `az login`, Terraform 1.6 or newer, an SSH key, and your OpenAI project id (`proj_...`).

## Pick a region and a size

Azure refuses some regions for some subscriptions. It answers `RequestDisallowedByAzure: The selected region is currently not accepting new customers`, and `westeurope` and `germanywestcentral` did that for the first subscription this was tried on. The default is `polandcentral`, which is close to Serbia.

A size also needs vCPU quota for its family in the region. A new subscription often has none for some families, and Azure answers `OperationNotAllowed ... exceeding approved ... Cores quota, Current Limit: 0`. That happened with the burstable `Standard_B2ls_v2` until Microsoft approved quota for its family. The default is now `Standard_B2ls_v2` (2 vCPUs, 4 GB). `Standard_D2als_v6` has the same size and worked without a request, so use it if your subscription has no Bsv2 quota.

To check before you apply:

```sh
# Quota per family: use a size whose family shows a limit of 2 or more.
az vm list-usage --location polandcentral --query "[?to_number(limit)>\`0\`].{family:name.value, used:currentValue, limit:limit}" -o table

# Sizes the region offers you: restricted must be 0.
az vm list-skus --location polandcentral --resource-type virtualMachines \
  --query "[?starts_with(name,'Standard_D2')].{name:name, family:family, restricted:length(restrictions)}" -o table
```

Pick a size whose family has quota in the first list and `restricted` at 0 in the second, and set `location` and `vm_size` in `environments/<environment>.tfvars`. To keep a cheaper size, ask Azure for more quota in the portal under **Quotas**, which can take time. Changing the region replaces the resource group, which is safe while it holds nothing.

## Create the server

```sh
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`: your SSH public key, the address you SSH from, and the OpenAI project id. In `environments/dev.tfvars`, set `carrier_ips` to `[]` if you don't have Zadarma's addresses. The server then starts closed to every carrier. Then run:

```sh
terraform init
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

The VM takes a few minutes to install Docker and build the server after Terraform finishes. To watch it, run the `ssh_command` output, then `cloud-init status --wait` and `docker compose -f /opt/lobbystack-sip/docker-compose.yml logs asterisk`.

The VM accepts only the key whose public half is `ssh_public_key`. If SSH answers `Permission denied (publickey)`, your client isn't offering that key: connect with `ssh -i <private key file> azureuser@<public_ip>`, or add the key to a `Host` entry in `~/.ssh/config`.

Replacing the VM gives it new host keys while the static address stays, so SSH then stops with `REMOTE HOST IDENTIFICATION HAS CHANGED`. After a replacement you made, run `ssh-keygen -R <public_ip>` and connect again. Treat the same warning as real when you didn't replace anything.

## Connect it

1. Put the `zadarma_sip_host` output in `.env` as `ZADARMA_SIP_HOST` on the worker.
2. In Zadarma, set a number's destination to the `zadarma_destination_example` output, with that number's digits in place of the example's.
3. Set `carrier_ips` in `environments/<environment>.tfvars` to the addresses Zadarma's calls come from, and apply again. That opens the firewall for them and tells the server to accept them.

## Run the web app

`deploy_app = true` in an environment's tfvars file adds a VM for the dashboard, the worker, Postgres, Redis and Caddy, which `docker-compose.yml` runs, and serves it over HTTPS on `app_domain`. It sits beside the SIP server in the same group, takes `Standard_D2as_v6` (2 vCPUs, 8 GB) by default, and has a 64 GB disk. Its resources are named from `{app_name}-app`, such as `lobbystack-app-public-ip-dev`. Terraform prepares the VM and clones the code, but starts nothing, because the stack needs secrets that only you have.

1. **Apply.** Push the branch `app_repository_ref` names, then apply the environment. The `app_dns_records` output lists the records, and `app_ssh_command` the login.
2. **DNS.** Where the domain's DNS lives (for `lobbystack.com`, Cloudflare), add each record from `app_dns_records`. In Cloudflare, switch the record's proxy off (grey cloud, DNS only), so Caddy can answer Let's Encrypt's challenge and reach visitors directly. For `dev.lobbystack.com` that is one `A` record with host `dev`. For `lobbystack.com` it is `A` records for `@` and `www`. Set the TTL to Automatic. Wait until `dig +short dev.lobbystack.com` answers with the address.
3. **The settings file.** Make a copy of your `.env` and change these lines, using your own domain. Generate every secret with `openssl rand -hex 32`, and don't reuse the ones from your laptop:

   ```
   COMPOSE_FILE=docker-compose.yml:docker-compose.tls.yml
   HTTP_BIND_ADDRESS=0.0.0.0
   CADDY_ON_DEMAND_TLS=true
   APP_HOSTNAME=dev.lobbystack.com
   APP_BASE_URL=https://dev.lobbystack.com
   NEXT_PUBLIC_APP_URL=https://dev.lobbystack.com
   ```

   Caddy asks the admin before it gets a certificate, and the admin approves only the host named by `APP_BASE_URL` and `MARKETING_HOSTS`, so those must name the domain. Keep `ZADARMA_SIP_HOST` as the SIP server's address, not this VM's.
4. **Copy it and start.**

   ```sh
   scp -i ~/.ssh/terraform .env azureuser@<app_public_ip>:/opt/lobbystack-app/.env
   ssh -i ~/.ssh/terraform azureuser@<app_public_ip>
   cloud-init status --wait          # done
   lobbystack-update                 # builds the images and starts the stack, which takes a few minutes
   ```
5. **Webhooks.** Point OpenAI's `live.transport.incoming`, Polar and each carrier at `https://<app_domain>/api/webhooks/...` instead of a tunnel.

`lobbystack-update` fetches `app_repository_ref` again and rebuilds, so run it for each release. It needs the `.env` first and says so when it's missing. Watch the stack with `docker compose logs -f admin` in `/opt/lobbystack-app`.

The VM's first-boot text is part of its definition, so changing `app_repository_url` or `app_repository_ref` replaces the VM, and its disk with it. Move the data first, or run `lobbystack-update` on the VM and leave the tfvars alone until you want a new VM. A fresh VM starts with an empty database.

## Change settings

The network rules update in place. The server's own settings, such as `carrier_ips`, `openai_project_id` and the files from `docker/asterisk`, are written once, on first boot, so changing them replaces the VM. The static IP address stays, and calls stop for the few minutes it takes to start again. For a quick change without a replacement, edit `/opt/lobbystack-sip/asterisk.env` on the VM and run `docker compose up -d` there, then put the same value in `environments/<environment>.tfvars` or `terraform.tfvars`, so the next replacement keeps it.

## Keep the state private

The state holds the OpenAI project id, which lets anyone who has it dial in. Don't commit it. For anything beyond a trial, and always for `prod`, keep it in an encrypted remote backend, such as a private Azure storage account. A backend keeps one state per workspace, so the environments stay apart:

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

`terraform.tfvars`, the state files and the workspaces' state folder (`terraform.tfstate.d/`) are in `.gitignore`. The environment files are not, so keep secrets out of them. `.terraform.lock.hcl` isn't, so commit it.

## Not included

- TLS from the carrier. The server supports it, but it needs a certificate for the VM's name, which this configuration doesn't create. Open TCP 5061 yourself if you add one.
- Monitoring, backups and alerts.
- A confirmed full apply. The configuration is validated, and the first-boot script is checked to write the repository's files exactly. The first apply stopped on a region the subscription couldn't use, which is why the region and size checks above exist. Check the result of your own apply.

## Remove it

Select the environment's workspace first. `terraform destroy -var-file=environments/<environment>.tfvars` removes that environment's resources, including the static address. `python3 scripts/python/stop.py [environment]` stops the VM's compute bill instead and keeps the address, and `python3 scripts/python/start.py [environment]` brings it back. Numbers routed to that address stop working until you route them somewhere else.
