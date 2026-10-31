-- Segunda barreira para os anexos: o próprio Storage recusa tipos fora da lista e arquivos acima de 25 MB,
-- mesmo que alguém use a URL assinada de upload com outro arquivo. O limite fino (MB do painel) é
-- conferido pelo servidor antes de a mensagem ir ao DataCrazy.
update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
    'video/mp4'
  ]
where id = 'webchat';
