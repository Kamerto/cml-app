Sub PoslatDoAplikace()
    Dim objMail As Outlook.MailItem
    Dim strID As String
    Dim strSubject As String
    Dim strBody As String
    Dim http As Object
    Dim url As String
    Dim payload As String
    Dim zakazkaID As String

    ' 1. Získání aktuálního mailu
    On Error Resume Next
    Set objMail = Application.ActiveExplorer.Selection.Item(1)
    On Error GoTo 0
    
    If objMail Is Nothing Then
        MsgBox "Není vybrán žádný e-mail.", vbExclamation
        Exit Sub
    End If

    ' 2. Okno pro ruční zadání ID (vždy prázdné)
    ' Pokud ponecháš prázdné, aplikace ví, že má vytvořit novou kartu
    zakazkaID = InputBox("Zadejte ID zakázky pro přiřazení (ponechte prázdné pro NOVOU zakázku):", "Odeslání do systému")
    
    ' Poznámka: Pokud uživatel stornuje okno (Cancel), zakazkaID bude prázdné,
    ' ale my chceme rozlišit prázdné (nová) a storno.
    ' Pro zjednodušení: pokud dáš Cancel, prostě se nic nepošle.

    ' 3. Příprava dat
    strID = objMail.EntryID
    strSubject = objMail.Subject
    strBody = Left(objMail.Body, 2000) ' Posíláme delší náhled pro AI analýzu
    
    ' PRODUKČNÍ URL - CML App na Vercel
    url = "https://cml-app-ten.vercel.app/api/webhooks/incoming"

    ' 4. Vytvoření JSONu
    ' JSON obsahuje buď ID zakázky, nebo prázdný řetězec
    payload = "{" & _
                """zakazka_id"": """ & zakazkaID & """, " & _
                """subject"": """ & CleanJSON(strSubject) & """, " & _
                """entry_id"": """ & strID & """, " & _
                """preview"": """ & CleanJSON(strBody) & """" & _
              "}"

    ' 5. Odeslání
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/json"
    
    On Error Resume Next
    http.Send payload
    
    If Err.Number = 0 Then
        If zakazkaID = "" Then
            MsgBox "Odesláno jako NOVÁ zakázka.", vbInformation
        Else
            MsgBox "Připojeno k zakázce ID: " & zakazkaID, vbInformation
        End If
    Else
        MsgBox "Chyba při odesílání: " & Err.Description & vbCrLf & "Zkontrolujte připojení k internetu.", vbCritical
    End If
    On Error GoTo 0
End Sub

' Pomocná funkce pro vyčištění textu pro JSON (uvozovky, nové řádky)
Function CleanJSON(txt As String) As String
    Dim out As String
    out = Replace(txt, "\", "\\")
    out = Replace(out, """", "\""")
    out = Replace(out, vbCr, " ")
    out = Replace(out, vbLf, " ")
    out = Replace(out, vbTab, " ")
    CleanJSON = out
End Function
