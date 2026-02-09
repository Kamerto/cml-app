Sub PoslatDoAplikace()
    ' VERZE: cml-app-final (CLI Deploy)
    Dim objMail As Outlook.MailItem
    Dim strID As String
    Dim strSubject As String
    Dim strBody As String
    Dim http As Object
    Dim url As String
    Dim payload As String
    Dim zakazkaID As String

    ' 1. Získání mailu
    On Error Resume Next
    Set objMail = Application.ActiveExplorer.Selection.Item(1)
    On Error GoTo 0
    
    If objMail Is Nothing Then
        MsgBox "Není vybrán žádný e-mail.", vbExclamation
        Exit Sub
    End If

    ' 2. ID zakázky
    zakazkaID = InputBox("Zadejte ID zakázky (nebo nechte prázdné pro NOVOU):", "Odeslání do cml-app-final")
    
    ' 3. Příprava dat
    strID = objMail.EntryID
    strSubject = objMail.Subject
    strBody = Left(objMail.Body, 2000)
    
    ' ✅ FINÁLNÍ URL (CLI DEPLOY - v2)
    url = "https://cml-app-v2-nine.vercel.app/api/incoming"

    ' 4. JSON
    payload = "{" & _
                """zakazka_id"": """ & zakazkaID & """, " & _
                """subject"": """ & CleanJSON(strSubject) & """, " & _
                """entry_id"": """ & strID & """, " & _
                """preview"": """ & CleanJSON(strBody) & """" & _
              "}"

    ' 5. Odeslání
    On Error Resume Next
    Set http = CreateObject("MSXML2.XMLHTTP")
    If http Is Nothing Then Set http = CreateObject("Microsoft.XMLHTTP")
    
    If http Is Nothing Then
        MsgBox "❌ Nelze vytvořit HTTP objekt. Kontaktujte správce.", vbCritical
        Exit Sub
    End If

    http.Open "POST", url, False
    http.setRequestHeader "Content-Type", "application/json"
    
    ' Pokus o timeout (jen pro ServerXMLHTTP, u XMLHTTP se ignoruje)
    On Error Resume Next
    http.setTimeouts 5000, 5000, 10000, 10000
    On Error GoTo 0
    
    On Error Resume Next
    http.Send payload
    
    If Err.Number = 0 Then
        ' Odstranění případného BOM nebo paznaků na začátku
        Dim cleanResp As String
        cleanResp = http.responseText
        If Left(cleanResp, 1) = "?" Then cleanResp = Mid(cleanResp, 2)
        
        If http.Status = 200 Then
            If zakazkaID = "" Then
                MsgBox "✅ Odesláno do: " & url & vbCrLf & "Jako NOVÁ zakázka." & vbCrLf & "Odpověď: " & cleanResp, vbInformation
            Else
                MsgBox "✅ Odesláno do: " & url & vbCrLf & "Připojeno k zakázce " & zakazkaID & vbCrLf & "Odpověď: " & cleanResp, vbInformation
            End If
        Else
            MsgBox "❌ Chyba serveru (" & http.Status & "): " & cleanResp, vbCritical
        End If
    Else
        MsgBox "❌ Chyba komunikace s " & url & ": " & Err.Description, vbCritical
    End If
    On Error GoTo 0
End Sub

Function CleanJSON(txt As String) As String
    Dim out As String
    out = Replace(txt, "\", "\\")
    out = Replace(out, """", "\""")
    out = Replace(out, vbCr, " ")
    out = Replace(out, vbLf, " ")
    out = Replace(out, vbTab, " ")
    CleanJSON = out
End Function
