Sub PoslatDoAplikace()
    ' VERZE: cml-app-final (v2.7.11)
    Dim objMail As Outlook.MailItem
    Dim strID As String
    Dim strSubject As String
    Dim strBody As String
    Dim http As Object
    Dim url As String
    Dim payload As String
    Dim zakazkaID As String
    Dim strSender As String
    Dim strReceivedAt As String
    Dim strStoreID As String

    ' 1. Získání vybraného e-mailu
    On Error Resume Next
    Set objMail = Application.ActiveExplorer.Selection.Item(1)
    
    If Err.Number <> 0 Or objMail Is Nothing Then
        MsgBox "❌ Chyba: Ujistěte se, že máte v seznamu vybraný e-mail.", vbCritical
        On Error GoTo 0
        Exit Sub
    End If
    On Error GoTo 0

    ' 2. Dotaz na ID zakázky (volitelné)
    zakazkaID = InputBox("Zadejte ID zakázky (ponechte PRÁZDNÉ pro vytvoření NOVÉ):", "Odeslání do CML Boardu")
    
    ' 3. Příprava dat z e-mailu
    strID = objMail.EntryID
    strStoreID = objMail.Parent.StoreID
    strSubject = objMail.Subject
    strBody = Left(objMail.Body, 2500) ' Prvních 2500 znaků pro AI analýzu
    strSender = objMail.SenderName
    strReceivedAt = Format(objMail.ReceivedTime, "yyyy-mm-ddThh:nn:ss") & "Z"
    
    ' ✅ URL tvé aplikace na Vercelu
    url = "https://cml-app-v2-nine.vercel.app/api/incoming"

    ' 4. Sestavení JSONu
    payload = "{" & _
                """zakazka_id"": """ & CleanJSON(zakazkaID) & """, " & _
                """subject"": """ & CleanJSON(strSubject) & """, " & _
                """entry_id"": """ & strID & """, " & _
                """store_id"": """ & strStoreID & """, " & _
                """sender"": """ & CleanJSON(strSender) & """, " & _
                """received_at"": """ & strReceivedAt & """, " & _
                """preview"": """ & CleanJSON(strBody) & """" & _
              "}"

    ' 5. Odeslání požadavku
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/json"
    
    ' Timeouts: Resolve, Connect, Send, Receive (v ms)
    On Error Resume Next
    http.setTimeouts 5000, 5000, 10000, 15000
    http.Send payload
    
    If Err.Number <> 0 Then
        MsgBox "❌ Chyba komunikace: " & Err.Description, vbCritical
        On Error GoTo 0
        Exit Sub
    End If
    On Error GoTo 0
    
    ' 6. Vyhodnocení odpovědi
    If http.Status = 200 Then
        If zakazkaID = "" Then
            MsgBox "✅ Hotovo! E-mail byl odeslán a AI vytvoří novou kartu na Tabuli.", vbInformation
        Else
            MsgBox "✅ Hotovo! E-mail byl úspěšně připojen k zakázce: " & zakazkaID, vbInformation
        End If
    Else
        MsgBox "❌ Chyba serveru (" & http.Status & "): " & http.responseText, vbCritical
    End If
End Sub

' Pomocná funkce pro ošetření speciálních znaků v JSONu
Function CleanJSON(txt As String) As String
    Dim out As String
    out = Replace(txt, "\", "\\")
    out = Replace(out, """", "\""")
    out = Replace(out, vbCr, " ")
    out = Replace(out, vbLf, " ")
    out = Replace(out, vbTab, " ")
    CleanJSON = out
End Function
