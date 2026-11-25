# The server real customers' calls reach. Keep its state in an encrypted remote backend. See README.md.
# Settings that aren't secret. The SSH key, the addresses that may reach SSH and the OpenAI project id go in
# terraform.tfvars, which is gitignored. Use it with: terraform plan -var-file=environments/prod.tfvars

environment = "prod"

# The PRD subscription. Replace the placeholder with its id (`az account list --query "[].[name,id]" -o tsv`). Until then
# every plan for prod stops on the variable check, so prod can never land in the NPD subscription by mistake.
subscription_id = "670d927b-4c03-4066-9c1a-4ea2f8a498bb"
app_name        = "lobbystack"
location        = "polandcentral"
vm_size         = "Standard_B2ls_v2"

# The carrier's SIP server addresses. Zadarma's servers sit in 185.45.152.0/22. Narrow it once you know which
# addresses the calls come from. Empty leaves the server closed to every carrier.
carrier_ips = ["185.45.152.0/22"]

# The web app on its own VM, on the apex domain and www. Create the records that the app_dns_records output lists at the
# registrar. The ref is the release the VM clones, so point it at a tag or main once the feature branch is merged.
deploy_app         = true
app_domain         = "lobbystack.com"
app_repository_ref = "main"
