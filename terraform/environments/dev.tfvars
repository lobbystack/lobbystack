# Day-to-day testing. Stop the VM with scripts/python/stop.py when you aren't using it.
# Settings that aren't secret. The SSH key, the addresses that may reach SSH and the OpenAI project id go in
# terraform.tfvars, which is gitignored. Use it with: terraform plan -var-file=environments/dev.tfvars

environment = "dev"

# The NPD subscription, which holds dev.
subscription_id = "273b7dfc-11a7-452b-941b-325123dfeaf0"
app_name        = "lobbystack"
location        = "polandcentral"
vm_size         = "Standard_B2ls_v2"

# The carrier's SIP server addresses. Zadarma's servers sit in 185.45.152.0/22. Narrow it once you know which
# addresses the calls come from. Empty leaves the server closed to every carrier.
carrier_ips = ["185.45.152.0/22"]

# The web app on its own VM. The marketing site and the dashboard are one app, so one VM answers on both names. Create
# the records that the app_dns_records output lists in the lobbystack.com zone at Cloudflare, with the proxy off. It
# clones the branch below on its first boot, so push the branch before you apply.
deploy_app         = true
marketing_domain   = "dev.lobbystack.com"
app_domain         = "dev.app.lobbystack.com"
app_repository_ref = "feature/external-phone-numbers"

