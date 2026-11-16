# Single Redirect Rules for geo-routing (5 of 10 free-plan rules). Apply per zone.
variable "zone_id" { type = string }

resource "cloudflare_ruleset" "cardapiofc_geo_redirects" {
  zone_id = var.zone_id
  name    = "cardapiofc geo-routing"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules {
    description = "Geo-route GB to /en-gb/"
    action      = "redirect"
    expression  = "(ip.src.country eq \"GB\") and not cf.client.bot and not http.request.uri.query contains \"edition=\" and not http.cookie contains \"cfc_edition=\" and (http.request.uri.path eq \"/\" or http.request.uri.path eq \"/search\" or http.request.uri.path eq \"/favourites\" or http.request.uri.path eq \"/favorites\" or http.request.uri.path eq \"/my_agenda\" or http.request.uri.path eq \"/reminder\" or http.request.uri.path eq \"/settings\" or starts_with(http.request.uri.path, \"/match/\") or starts_with(http.request.uri.path, \"/team/\") or starts_with(http.request.uri.path, \"/league/\"))"
    action_parameters {
      from_value {
        status_code           = 302
        preserve_query_string = false
        target_url {
          expression = "concat(\"/en-gb\", http.request.uri.path, if(http.request.uri.query ne \"\", concat(\"?\", http.request.uri.query, \"&cfc_geo=GB\"), \"?cfc_geo=GB\"))"
        }
      }
    }
  }

  rules {
    description = "Geo-route IE to /en-ie/"
    action      = "redirect"
    expression  = "(ip.src.country eq \"IE\") and not cf.client.bot and not http.request.uri.query contains \"edition=\" and not http.cookie contains \"cfc_edition=\" and (http.request.uri.path eq \"/\" or http.request.uri.path eq \"/search\" or http.request.uri.path eq \"/favourites\" or http.request.uri.path eq \"/favorites\" or http.request.uri.path eq \"/my_agenda\" or http.request.uri.path eq \"/reminder\" or http.request.uri.path eq \"/settings\" or starts_with(http.request.uri.path, \"/match/\") or starts_with(http.request.uri.path, \"/team/\") or starts_with(http.request.uri.path, \"/league/\"))"
    action_parameters {
      from_value {
        status_code           = 302
        preserve_query_string = false
        target_url {
          expression = "concat(\"/en-ie\", http.request.uri.path, if(http.request.uri.query ne \"\", concat(\"?\", http.request.uri.query, \"&cfc_geo=IE\"), \"?cfc_geo=IE\"))"
        }
      }
    }
  }

  rules {
    description = "Geo-route BR to /pt-br/"
    action      = "redirect"
    expression  = "(ip.src.country eq \"BR\") and not cf.client.bot and not http.request.uri.query contains \"edition=\" and not http.cookie contains \"cfc_edition=\" and (http.request.uri.path eq \"/\" or http.request.uri.path eq \"/search\" or http.request.uri.path eq \"/favourites\" or http.request.uri.path eq \"/favorites\" or http.request.uri.path eq \"/my_agenda\" or http.request.uri.path eq \"/reminder\" or http.request.uri.path eq \"/settings\" or starts_with(http.request.uri.path, \"/match/\") or starts_with(http.request.uri.path, \"/team/\") or starts_with(http.request.uri.path, \"/league/\"))"
    action_parameters {
      from_value {
        status_code           = 302
        preserve_query_string = false
        target_url {
          expression = "concat(\"/pt-br\", http.request.uri.path, if(http.request.uri.query ne \"\", concat(\"?\", http.request.uri.query, \"&cfc_geo=BR\"), \"?cfc_geo=BR\"))"
        }
      }
    }
  }

  rules {
    description = "Geo-route PT to /pt-pt/"
    action      = "redirect"
    expression  = "(ip.src.country eq \"PT\") and not cf.client.bot and not http.request.uri.query contains \"edition=\" and not http.cookie contains \"cfc_edition=\" and (http.request.uri.path eq \"/\" or http.request.uri.path eq \"/search\" or http.request.uri.path eq \"/favourites\" or http.request.uri.path eq \"/favorites\" or http.request.uri.path eq \"/my_agenda\" or http.request.uri.path eq \"/reminder\" or http.request.uri.path eq \"/settings\" or starts_with(http.request.uri.path, \"/match/\") or starts_with(http.request.uri.path, \"/team/\") or starts_with(http.request.uri.path, \"/league/\"))"
    action_parameters {
      from_value {
        status_code           = 302
        preserve_query_string = false
        target_url {
          expression = "concat(\"/pt-pt\", http.request.uri.path, if(http.request.uri.query ne \"\", concat(\"?\", http.request.uri.query, \"&cfc_geo=PT\"), \"?cfc_geo=PT\"))"
        }
      }
    }
  }

  rules {
    description = "Geo-route AR to /es-ar/"
    action      = "redirect"
    expression  = "(ip.src.country eq \"AR\") and not cf.client.bot and not http.request.uri.query contains \"edition=\" and not http.cookie contains \"cfc_edition=\" and (http.request.uri.path eq \"/\" or http.request.uri.path eq \"/search\" or http.request.uri.path eq \"/favourites\" or http.request.uri.path eq \"/favorites\" or http.request.uri.path eq \"/my_agenda\" or http.request.uri.path eq \"/reminder\" or http.request.uri.path eq \"/settings\" or starts_with(http.request.uri.path, \"/match/\") or starts_with(http.request.uri.path, \"/team/\") or starts_with(http.request.uri.path, \"/league/\"))"
    action_parameters {
      from_value {
        status_code           = 302
        preserve_query_string = false
        target_url {
          expression = "concat(\"/es-ar\", http.request.uri.path, if(http.request.uri.query ne \"\", concat(\"?\", http.request.uri.query, \"&cfc_geo=AR\"), \"?cfc_geo=AR\"))"
        }
      }
    }
  }
}
